---
title: Missing image
image: figures/dot.png
caption: "A real image at the top of the infobox"
infobox:
  The idea: "Missing images drop out with a warning"
---
The next figure exists:

![A dot](figures/dot.png "A three by two pixel image, never upscaled.")

The next two do not exist, so they leave no figure, only a warning on stderr:

![Missing](figures/not-here.png "This caption must not render")

![[also-not-here.png]]

## Section

Body.
