# Fast WebGL2 sprites

## Install

This will create a "websprite" directory
in the current directory.
```
git clone https://github.com/doug65536/websprite.git
cd websprite
npm start
```

Use one of the links in the output to open the page.

The test renders 3072 sprites moving randomly.

## Code

It uses an SoA format to pack the instance data in a data oriented
SIMD-friendly layout.



## Art

Credit: [https://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental](https://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental)

It was 2048x1536, I adjusted it to 2048x2048 and extended the code to
take the usable area in the config file. WebGL2 does not support
sampler2DRect (surprisingly!). Not even on RTX 2060 Super.
