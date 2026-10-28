---
title: Speculative decoding
slug: speculative-decoding
note: "A working article on speculative decoding for large language model inference. Written 2026-10-28; every source linked below was checked to resolve that day. Figures quoted from papers are the papers' own measurements."
infobox:
  - "What: A small **drafter** proposes several tokens; the large **target** model checks all of them in one forward pass"
  - "Guarantee: Lossless: the output has exactly the target model's distribution"
  - "Why it pays: Single-sequence decoding is memory-bandwidth bound, so scoring a few extra positions costs little more than scoring one"
  - "Reported speedups: 2x to 3x on T5-XXL; 2x to 2.5x on Chinchilla 70B"
  - "Introduced: Leviathan, Kalman and Matias (2022); Chen et al. (2023)"
  - "Related: Blockwise parallel decoding (2018), Medusa, EAGLE"
aliases: [Speculative sampling]
tags: [llm-inference, decoding]
created: 2026-10-28
---

**Speculative decoding** (also **speculative sampling**) is a technique for generating text from a large autoregressive language model several tokens at a time without changing what the model would have written. A small, fast **drafter** proposes the next *k* tokens; the large **target** model scores all of them in a single forward pass, keeps the longest prefix it agrees with under a modified [[Rejection sampling|rejection-sampling]] rule, and adds one token of its own. The rule provably preserves the target model's output distribution, so the speedup comes with no change in quality.[^leviathan][^chen] The method was introduced independently by researchers at Google and DeepMind in 2022 and 2023, building on earlier blockwise parallel decoding,[^stern] and is now built into the major open-source serving engines.[^vllm][^sglang]

## Why it works

Generating one token from a [[Transformer]] requires reading every weight of the model from accelerator memory. At batch size 1 the arithmetic per byte read is small, so the step time is set by memory bandwidth rather than compute. Feeding the model several candidate tokens in the same step reuses the same weight reads, and the extra positions are almost free until the batch becomes large enough to be compute bound.[^chen][^medusa] Speculative decoding spends that spare compute on guesses.

If a guess is right, the model has produced several tokens for the price of one step. If it is wrong, the target model's own computation at the first rejected position still yields a correct token, so no step is wasted entirely.

## The verification rule

Let *q(x)* be the drafter's probability for a proposed token *x* and *p(x)* the target model's probability for the same token given the same prefix. Leviathan et al. and Chen et al. use the same three-part rule:[^leviathan][^chen]

```text
1. accept the drafted token x with probability min(1, p(x) / q(x))
2. if rejected, sample a replacement from the residual
     p'(x) = max(0, p(x) - q(x)) / sum over y of max(0, p(y) - q(y))
   and discard the remaining drafts
3. if all k drafts are accepted, sample one bonus token from the target's (k+1)-th distribution
```

### Why the output is exactly p

The probability of emitting *x* is the chance it was drafted and kept, plus the chance that some draft was rejected and *x* was drawn from the residual:

```text
P(x) = q(x) * min(1, p(x)/q(x)) + P(reject) * p'(x)
     = min(p(x), q(x))          + max(0, p(x) - q(x))
     = p(x)
```

The second line uses the fact that the rejection probability equals the normaliser of the residual. The identity holds at any sampling temperature; at temperature 0 it reduces to accepting a draft exactly when the drafter's and target's top tokens agree.

### Acceptance rate

The expected acceptance rate of a single draft is the overlap of the two distributions, the sum over *x* of min(*p(x)*, *q(x)*), which equals one minus the total variation distance between them. A drafter is useful in proportion to how closely its distribution matches the target's on the text actually being generated.[^leviathan]

## Tokens per step and choosing k

If each draft is accepted independently with probability *α*, the expected number of tokens produced per target forward pass with *k* drafts is (1 − *α*^(*k*+1)) / (1 − *α*).[^leviathan] The gain flattens quickly: each extra draft position is only reached if every earlier one survived.

| α | k = 2 | k = 4 | k = 8 |
|---|---|---|---|
| 0.6 | 1.96 | 2.31 | 2.47 |
| 0.8 | 2.44 | 3.36 | 4.33 |
| 0.9 | 2.71 | 4.10 | 6.13 |

Tokens per step is not throughput. Each draft costs a drafter call, and a longer block makes the verification pass more expensive, so the best *k* is the one that maximises tokens per unit of wall-clock time on the actual hardware. Sequoia selects the tree size and depth automatically for a given platform for this reason.[^sequoia]

## Verification variants

| Variant | Idea | Lossless | Source |
|---|---|---|---|
| Token-wise | Accept or reject drafts one at a time along a single chain | Yes | Leviathan et al.;[^leviathan] Chen et al.[^chen] |
| Block verification | Decide the whole block jointly; never worse than token-wise, 5% to 8% faster in wall-clock time in the paper | Yes | Sun et al.[^block] |
| Tree verification | Verify a tree of candidate continuations in one pass using an attention mask in which each node sees only its ancestors | Yes | SpecInfer;[^specinfer] Sequoia[^sequoia] |
| Multi-draft | Several independent drafts per position, coupled by optimal transport | Yes | SpecTr[^spectr] |
| Typical acceptance | Accept drafts the target finds plausible enough rather than matching its distribution exactly | No | Medusa[^medusa] |

## Drafter families

- **Separate small model.** A smaller model from the same family with the same tokenizer, as in the original papers.[^leviathan][^chen] Simple to deploy, but the drafter has to be served alongside the target.
- **Extra decoding heads.** Medusa adds several heads to the target model, each predicting a token further ahead, and verifies their combinations with tree attention. The paper reports over 2.2x speedup with heads trained on a frozen backbone and 2.3x to 3.6x when the backbone is fine-tuned jointly.[^medusa]
- **Feature-level drafter.** EAGLE drafts from the target model's second-to-top-layer features rather than from tokens, reporting 2.7x to 3.5x latency speedup on LLaMA2-Chat 70B.[^eagle] EAGLE-2 adds dynamic draft trees (3.05x to 4.26x),[^eagle2] and EAGLE-3 moves to direct token prediction with multi-layer feature fusion, reporting up to 6.5x.[^eagle3]
- **No drafter.** Prompt lookup decoding proposes n-grams copied from the prompt, which works well for input-grounded tasks such as summarisation and code editing.[^pld] Lookahead decoding is an exact parallel decoding algorithm that needs no auxiliary model or data store, reporting up to 1.8x on MT-bench.[^lookahead]

## Libraries and engines

vLLM documents speculative decoding with separate draft models, n-gram matching, EAGLE and multi-token-prediction heads.[^vllm] SGLang lists EAGLE-2, EAGLE-3, multi-token prediction, classic draft-model decoding and an n-gram variant.[^sglang] Hugging Face Transformers exposes the technique as assisted decoding.[^hf]

## Worked example

A toy vocabulary of four tokens, with target and drafter distributions for the next position:

| Token | Target p | Drafter q | min(p, q) | max(0, p − q) |
|---|---|---|---|---|
| A | 0.50 | 0.60 | 0.50 | 0.00 |
| B | 0.20 | 0.30 | 0.20 | 0.00 |
| C | 0.20 | 0.05 | 0.05 | 0.15 |
| D | 0.10 | 0.05 | 0.05 | 0.05 |

The acceptance rate is the sum of the min column, 0.80. If the drafter proposes A, it is kept with probability 0.50 / 0.60 ≈ 0.83. If it proposes C, then *p/q* = 4, so C is always kept. On a rejection the replacement is drawn from the residual column normalised to (0, 0, 0.75, 0.25): the residual moves probability back onto exactly the tokens the drafter under-proposed. Summing both paths for every token returns (0.50, 0.20, 0.20, 0.10), the target distribution.

With *α* = 0.8 and *k* = 4, the formula above gives (1 − 0.8^5) / 0.2 ≈ 3.36 tokens per target pass, before subtracting the cost of the drafter.

## Limitations

- **Batch size.** The free compute that drafts consume shrinks as the batch grows, so speedups are largest for single-user, latency-bound serving and smaller at high throughput. EAGLE-3 reports a 1.38x throughput gain at batch size 64 in SGLang, well below its single-sequence figure.[^eagle3]
- **Drafter mismatch.** Acceptance depends on how well the drafter matches the target on the actual traffic; a drafter trained on different data can cost more than it saves.
- **Lossy variants.** Relaxed acceptance rules such as typical acceptance trade the exact-distribution guarantee for more accepted tokens.[^medusa]

## Glossary

- **Target model**: the large model whose output distribution must be preserved.
- **Drafter**: the cheap proposer of candidate tokens; a small model, extra heads, or a lookup rule.
- **Acceptance rate (α)**: the probability that a drafted token survives verification.
- **Residual distribution**: the normalised positive part of *p − q*, sampled after a rejection.
- **Bonus token**: the extra token sampled from the target when every draft in a block is accepted.
- **Token tree**: several candidate continuations sharing prefixes, verified together with a tree attention mask.

[^leviathan]: Yaniv Leviathan, Matan Kalman, Yossi Matias. "Fast Inference from Transformers via Speculative Decoding." ICML 2023. arXiv:2211.17192. https://arxiv.org/abs/2211.17192
[^chen]: Charlie Chen, Sebastian Borgeaud, Geoffrey Irving, et al. "Accelerating Large Language Model Decoding with Speculative Sampling." 2023. arXiv:2302.01318. https://arxiv.org/abs/2302.01318
[^stern]: Mitchell Stern, Noam Shazeer, Jakob Uszkoreit. "Blockwise Parallel Decoding for Deep Autoregressive Models." NeurIPS 2018. arXiv:1811.03115. https://arxiv.org/abs/1811.03115
[^vllm]: vLLM project. "Speculative Decoding." vLLM documentation. https://docs.vllm.ai/en/latest/features/speculative_decoding/
[^sglang]: SGLang project. "Speculative Decoding." SGLang documentation. https://docs.sglang.ai/advanced_features/speculative_decoding.html
[^medusa]: Tianle Cai, Yuhong Li, Zhengyang Geng, et al. "Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads." 2024. arXiv:2401.10774. https://arxiv.org/abs/2401.10774
[^sequoia]: Zhuoming Chen, Avner May, Ruslan Svirschevski, et al. "Sequoia: Scalable, Robust, and Hardware-aware Speculative Decoding." 2024. arXiv:2402.12374. https://arxiv.org/abs/2402.12374
[^block]: Ziteng Sun, Uri Mendlovic, Yaniv Leviathan, et al. "Block Verification Accelerates Speculative Decoding." 2024. arXiv:2403.10444. https://arxiv.org/abs/2403.10444
[^specinfer]: Xupeng Miao, Gabriele Oliaro, Zhihao Zhang, et al. "SpecInfer: Accelerating Generative Large Language Model Serving with Tree-based Speculative Inference and Verification." 2023. arXiv:2305.09781. https://arxiv.org/abs/2305.09781
[^spectr]: Ziteng Sun, Ananda Theertha Suresh, Jae Hun Ro, et al. "SpecTr: Fast Speculative Decoding via Optimal Transport." NeurIPS 2023. arXiv:2310.15141. https://arxiv.org/abs/2310.15141
[^eagle]: Yuhui Li, Fangyun Wei, Chao Zhang, Hongyang Zhang. "EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty." 2024. arXiv:2401.15077. https://arxiv.org/abs/2401.15077
[^eagle2]: Yuhui Li, Fangyun Wei, Chao Zhang, Hongyang Zhang. "EAGLE-2: Faster Inference of Language Models with Dynamic Draft Trees." 2024. arXiv:2406.16858. https://arxiv.org/abs/2406.16858
[^eagle3]: Yuhui Li, Fangyun Wei, Chao Zhang, Hongyang Zhang. "EAGLE-3: Scaling up Inference Acceleration of Large Language Models via Training-Time Test." 2025. arXiv:2503.01840. https://arxiv.org/abs/2503.01840
[^pld]: Apoorv Saxena. "Prompt Lookup Decoding." GitHub repository, 2023. https://github.com/apoorvumang/prompt-lookup-decoding
[^lookahead]: Yichao Fu, Peter Bailis, Ion Stoica, Hao Zhang. "Break the Sequential Dependency of LLM Inference Using Lookahead Decoding." 2024. arXiv:2402.02057. https://arxiv.org/abs/2402.02057
[^hf]: Hugging Face. "Assisted decoding." Transformers documentation. https://huggingface.co/docs/transformers/main/en/assisted_decoding
