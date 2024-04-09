# Lost Pixel visual regression testing

Lost Pixel is a [modern open-source visual regression testing tool](https://github.com/lost-pixel/lost-pixel) that allows you to run self-hosted visual regression tests. [Lost Pixel Platofrm](https://lost-pixel.com) is for teams and is a cloud version of visual testing.

## Setting up self-hosted visual testing

Lost Pixel has first-class Histoire support meaning that you don't need to do much to add visual tests to your app if you have your Histoire book ready!

Start with installing lost-pixel by `npm install lost-pixel` and creating a `lostpixel.config.js|ts` file with following contents.

```javascript
import { CustomProjectConfig } from 'lost-pixel';

export const config: CustomProjectConfig = {
  histoireShots: {
    histoireUrl: './.histoire/dist',
  },
  generateOnly: true,
  failOnDifference: true
};
```
**Before running visual tests you need to have your Histoire book built first**.

This setup allows you to run visual tests locally. To test your stories run `npx lost-pixel`

To update the baselines run `npx lost-pixel update`.

## GitHub actions

To run your tests on CI you can use lost-pixel action utility. If you are running on any other CI provider - lost-pixel is a [docker image](https://hub.docker.com/r/lostpixel/lost-pixel) that is runnable on CI of your choice(only **within GitHub** currently though)

```yaml
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18.x
          cache: npm

      - name: Install dependencies
        run: npm install

      - name: Build histoire
        run: npm run story:build

      - name: Lost Pixel
        uses: lost-pixel/lost-pixel@v3.8.0
```

To update baselines locally run `npx lost-pixel docker update`, this will ensure that lost-pixel runs in docker and there are no OS differences in rendering between CI and local tests.

## Lost Pixel Platform

If you have self-hosted version of tests working it is not complicated to migrate to Lost Pixel Platform. Follow [this guide](https://docs.lost-pixel.com/user-docs/setup/lost-pixel-platform) to achieve that.
