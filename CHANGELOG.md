# [0.4.0](https://github.com/Akryum/histoire/compare/v0.3.3...v0.4.0) (2022-05-09)


### Bug Fixes

* remove import to @vue/runtime-core ([e8e81c9](https://github.com/Akryum/histoire/commit/e8e81c923f6103faf084f52a415a02e0e47afb17))
* sandbox style included in main app ([bce793d](https://github.com/Akryum/histoire/commit/bce793dea3336901fe46305c2798227b585a48bf))
* single layout no iframe  => couldn't scroll ([6afdd25](https://github.com/Akryum/histoire/commit/6afdd2578f0a6c7295d1aefd576788c951d95743))
* slot optimization in overflow menu ([0b11e00](https://github.com/Akryum/histoire/commit/0b11e0034735c666b969c35ce6a57019a868ed62))


### Features

* full text search in markdown docs, fix [#70](https://github.com/Akryum/histoire/issues/70) ([d6e23ce](https://github.com/Akryum/histoire/commit/d6e23ce34b8d15fa68221a29a4865d5cd76087a8))
* initial work to pre-bundle the client ([#87](https://github.com/Akryum/histoire/issues/87)) ([9e8cba9](https://github.com/Akryum/histoire/commit/9e8cba94f9bc1b18ff5c14b551279c5f9242bda7))
* remove mandatory vue3 vite plugin ([fde0929](https://github.com/Akryum/histoire/commit/fde09295a15fadf0d88b2aff24b361724e8a8ae9))
* **tailwind:** disable iframe ([08401bd](https://github.com/Akryum/histoire/commit/08401bd8c88146f09a973c993d4f28b29621e4e6))



## [0.3.3](https://github.com/Akryum/histoire/compare/v0.3.2...v0.3.3) (2022-05-08)


### Bug Fixes

* don't optimize histoire/client, fix [#79](https://github.com/Akryum/histoire/issues/79) ([ea22d1b](https://github.com/Akryum/histoire/commit/ea22d1bb14b36c35df6802e111d0546744b0e414))
* **search:** duplicate keys ([d94c778](https://github.com/Akryum/histoire/commit/d94c77897e3e088fbf8dd329bc9407e1e4db8e08))
* **search:** remove no result animation ([649490e](https://github.com/Akryum/histoire/commit/649490e488cfb176ef72a3d7e109cd949496c425))


### Features

* **search:** greatly reduce index download size ([305e560](https://github.com/Akryum/histoire/commit/305e560ad247ba745e4545d23030dc0eea814b63))



## [0.3.2](https://github.com/Akryum/histoire/compare/v0.3.1...v0.3.2) (2022-05-06)


### Features

* Add iframe parameter for single layout (fix [#80](https://github.com/Akryum/histoire/issues/80)) ([#81](https://github.com/Akryum/histoire/issues/81)) ([7f2d4b4](https://github.com/Akryum/histoire/commit/7f2d4b4641dfa59031503e4d5c5c807fcad40362))
* select control ([#78](https://github.com/Akryum/histoire/issues/78)) ([c9668db](https://github.com/Akryum/histoire/commit/c9668dba7180e6b251824ed7629e5d6f8cd8a6de))
* shared controls, fix [#75](https://github.com/Akryum/histoire/issues/75) ([a2488cf](https://github.com/Akryum/histoire/commit/a2488cfa1f35aac6fdc18b3330c57d8450f5e25a))
* tabs overflow menu, fix [#73](https://github.com/Akryum/histoire/issues/73) ([d42f438](https://github.com/Akryum/histoire/commit/d42f438c11711146405fc0a3a4ff8be7f2f7bdd6))
* **Variant:** setupApp prop ([0190cb0](https://github.com/Akryum/histoire/commit/0190cb071e56bc3a2b09585efb196e273bd16873))



## [0.3.1](https://github.com/Akryum/histoire/compare/v0.3.0...v0.3.1) (2022-05-02)


### Bug Fixes

* Trigger setupVue3 in worker (fix [#76](https://github.com/Akryum/histoire/issues/76)) ([#77](https://github.com/Akryum/histoire/issues/77)) ([323e535](https://github.com/Akryum/histoire/commit/323e535877c63c588a14630c54693578be49b1bb))



# [0.3.0](https://github.com/Akryum/histoire/compare/v0.2.5...v0.3.0) (2022-05-02)

### Migrating from v0.2

- The default dist folder is now `.histoire/dist` from `histoire-dist`
  -> If you didn't customize it: either takes this into account or add `outDir: 'histoire-dist'` to your config.

- The setup function export for Vue 3 has been changed from `default` to `setupVue3` and the type handler has been renamed from `defineVue3StorySetup` to `defineSetupVue3`

Before:

```ts
import { defineVue3StorySetup } from 'histoire/client'

export default defineVue3StorySetup(({ app }) => {
  app.provide('demo', 42)
})
```

After:

```ts
import { defineSetupVue3 } from 'histoire/client'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.provide('demo', 42)
})
```

### Bug Fixes

* add names to apps ([28f3448](https://github.com/Akryum/histoire/commit/28f3448f844ee81503be45d74695201643cc74b9))
* build preload links ([ebcf1d3](https://github.com/Akryum/histoire/commit/ebcf1d3c55f25f07e164f3d13d8c8774e2e8ea2f))
* **build:** disable minify to preserve function/variable names ([db84feb](https://github.com/Akryum/histoire/commit/db84feb00378faa97a9c2a3dcc68edd8d52d9d3c))
* collect story loader not clearing vite cache ([a6bbc53](https://github.com/Akryum/histoire/commit/a6bbc538588fe32e07c297c6f404ecc6da4cf2a6))
* controls css missing component style ([921073a](https://github.com/Akryum/histoire/commit/921073aedc59d061aac31d3f3b32f5c19166d735))
* **dev:** favicon respects base ([439f5fb](https://github.com/Akryum/histoire/commit/439f5fbf529d9084adf7c2852ea4cb04799e64d0))
* **docs:** dark: hr ([351e4dd](https://github.com/Akryum/histoire/commit/351e4ddfa1ee3c02bbc512245ccc8b3121a093aa))
* folder issue when selecting nested story ([e24357a](https://github.com/Akryum/histoire/commit/e24357ae15d9f61bd7957e460e2152a64079d966))
* grid, use manual CSS var ([a3accb0](https://github.com/Akryum/histoire/commit/a3accb006829ccbf263c3be4b1edbb5928a09de6))
* handle viteConfig.base, fix [#69](https://github.com/Akryum/histoire/issues/69) ([959d06c](https://github.com/Akryum/histoire/commit/959d06c3758dd286b473133cf80c243d3634dc38))
* init host variant state ([a752bcc](https://github.com/Akryum/histoire/commit/a752bcc58d0a3c65ada0d64803a991c2f1aa70de))
* renamed api ([da5e34a](https://github.com/Akryum/histoire/commit/da5e34af938de43310f96548beb764f63c8afa50))
* **search:** loading ux ([9348009](https://github.com/Akryum/histoire/commit/9348009d13823ce8f96f38bb9dff23cb70f361a2))
* **search:** new search didn't include story title for variants ([95943d5](https://github.com/Akryum/histoire/commit/95943d5949b09859116823c3df3614a078c30b16))
* split controls dist style in two ([4c248ec](https://github.com/Akryum/histoire/commit/4c248ecff1a9a3e1e9a20ca0f07d1646102c424b))
* **Story:** docsOnly shouldn't display variant number ([4fe00e6](https://github.com/Akryum/histoire/commit/4fe00e6b4cce40bf17ac45daf31c15998906fb65))
* **tailwind:** dark: better drop shadow design ([3993802](https://github.com/Akryum/histoire/commit/3993802b5e09abf5984688cdd3b842022d1cb3bd))
* **vue:** Anonymous components ([a81fef6](https://github.com/Akryum/histoire/commit/a81fef6222f017cfba7e94f3f16a0bfe806d122e))
* **vue:** codegen append text with no leading space to previous line ([f0f4816](https://github.com/Akryum/histoire/commit/f0f4816aa234d3df6d8a56b5746389f6985b59e4))
* **vue:** codegen cleanup `$setup.` more ([b234c9e](https://github.com/Akryum/histoire/commit/b234c9e8e1894518fc14f8ba5427886e56e5e691))
* **vue:** codegen content on new line if at least one attribute ([9c89037](https://github.com/Akryum/histoire/commit/9c8903775b2f48dc226129171179ab8f1f09ec70))
* **vue:** codegen: improved event listeners ([fee85a0](https://github.com/Akryum/histoire/commit/fee85a0981101b035823a7b916db3e79caa20922))
* **vue:** codegen: only put content on same line if it's text ([ca13bc5](https://github.com/Akryum/histoire/commit/ca13bc549c714ca6e02a13a6358269513596c0aa))
* **vue:** godegen custom directives ([be1b287](https://github.com/Akryum/histoire/commit/be1b2877d9214ae6a235fb927d6a1465c3c5faa1))


### Features

* Add events (fix [#32](https://github.com/Akryum/histoire/issues/32)) ([#72](https://github.com/Akryum/histoire/issues/72)) ([60bd8ae](https://github.com/Akryum/histoire/commit/60bd8ae2b50ae71218d9e425d4c48d8bacba46b6))
* Add opengraph and metadata to documentation ([#71](https://github.com/Akryum/histoire/issues/71)) ([4ba4e76](https://github.com/Akryum/histoire/commit/4ba4e76ffacc1884571b71b13c32c380a654bba0))
* basic plugin api and tailwind builtin plugin ([2a76d9d](https://github.com/Akryum/histoire/commit/2a76d9da4178f5bcc16955578f1783823e61e898))
* basic screenshot plugin, related [#34](https://github.com/Akryum/histoire/issues/34) ([aed2219](https://github.com/Akryum/histoire/commit/aed2219dc538678b0d21565e2cb526532b0b3a84))
* **config:** default output is now `.histoire/dist` ([ee4c399](https://github.com/Akryum/histoire/commit/ee4c3996a1cc76cb8c8847027fad70d6d103d32a))
* export plugin api ([a8fe26d](https://github.com/Akryum/histoire/commit/a8fe26dd48b3456da5fb14809a6a7ebd78fa045d))
* implicit `state` ([48037d5](https://github.com/Akryum/histoire/commit/48037d5cd63c1282aa845ccfad37a4ed995b4ab4))
* improved source code pane ([7111b5d](https://github.com/Akryum/histoire/commit/7111b5d9ec4c1b5d1708024b1c727ef4f482cfb5))
* percy plugin ([c31ccb8](https://github.com/Akryum/histoire/commit/c31ccb802d8e91864be9aec32abae829e9a67d70))
* **plugin:** onBuildEnd ([bd85b18](https://github.com/Akryum/histoire/commit/bd85b186daff8ed766e46f0797edd514fe7fe3fa))
* **search:** more performant and fuzzy ([02707af](https://github.com/Akryum/histoire/commit/02707af4f3a88ce2021169ad046e620357ac57a3))
* **Story:** docsOnly ([a18ccb1](https://github.com/Akryum/histoire/commit/a18ccb1e9c8511ab239adc6c246cedd42b080ea1))
* **Story:** id prop ([4cb6edc](https://github.com/Akryum/histoire/commit/4cb6edc219a0b98312f417aeda0af930a5c42dc2))
* support all state props + options API ([1e1b1fc](https://github.com/Akryum/histoire/commit/1e1b1fc78f4e087b11f765b94e284252f69ea8c4))
* **vue:** codegen handles void elements ([9b324ea](https://github.com/Akryum/histoire/commit/9b324ea349129603c13388e280a70546cc68d78e))
* **vue:** improved codegen ([9021605](https://github.com/Akryum/histoire/commit/9021605a272571b661a3a7ce882264f7b31f11ca))


### Performance Improvements

* faster design tokens initial render ([c18d457](https://github.com/Akryum/histoire/commit/c18d4573b1c9a509190eab564504d811ba059645))



## [0.2.5](https://github.com/Akryum/histoire/compare/v0.2.4...v0.2.5) (2022-04-20)


### Bug Fixes

* **HstColorShades:** handle long names ([03974ea](https://github.com/Akryum/histoire/commit/03974eaba315c905aa265e8e8fcf7a8f19710826))
* remove outline on dropdowns ([67cb60d](https://github.com/Akryum/histoire/commit/67cb60d7df02dc7d3ebdd037dad43590f8a6a051))
* **vue3:** codegen: convert " to ' in function props ([0a7b0ae](https://github.com/Akryum/histoire/commit/0a7b0aefe1ca43ede9879506fcc27d9cfb45d062))


### Features

* HstTokenList + HstTokenGrid ([f1db6d1](https://github.com/Akryum/histoire/commit/f1db6d16d33029e8cec50419c09bcb6e4d396cb4))
* Story title is now optional ([e2e3921](https://github.com/Akryum/histoire/commit/e2e3921bc35c3e530351c92052ce97419883d050))
* **tree:** groups ([aec7673](https://github.com/Akryum/histoire/commit/aec7673f5e934a62eece93cd6eea974353d6a6f5))



## [0.2.4](https://github.com/Akryum/histoire/compare/v0.2.3...v0.2.4) (2022-04-19)


### Bug Fixes

* Lock link color with tailwind class (fix [#66](https://github.com/Akryum/histoire/issues/66)) ([#67](https://github.com/Akryum/histoire/issues/67)) ([ef2ceea](https://github.com/Akryum/histoire/commit/ef2ceea1015ed59cac942997140a801bb45da35f))
* **search:** performance issues, fix [#68](https://github.com/Akryum/histoire/issues/68) ([62232e7](https://github.com/Akryum/histoire/commit/62232e7b0266224dcf371948eb1f7b18d7625af5))



## [0.2.3](https://github.com/Akryum/histoire/compare/v0.2.2...v0.2.3) (2022-04-10)


### Bug Fixes

* missing vite html transforms during dev ([d77c42c](https://github.com/Akryum/histoire/commit/d77c42c71f07d6e60c7eaeedbd4ece5a80ecf700))
* preview bg not working ([e7d4134](https://github.com/Akryum/histoire/commit/e7d41346f4ebbd7809dfc5f7f7c9276b876d34d5))
* preview settings not updated ([5691f48](https://github.com/Akryum/histoire/commit/5691f48e40dc114623e95b5a4e8494f9a72138ed))
* remove unnecessary gap between header and story list ([b319bb5](https://github.com/Akryum/histoire/commit/b319bb5a28d64c78ff9df4837d00122dcec6520d))
* **story:** inherit props to variants ([23fa903](https://github.com/Akryum/histoire/commit/23fa903ce2920ef8e26ee7714a1c4d86966db8ba))
* **vue3:** codegen function as prop value ([5ec9955](https://github.com/Akryum/histoire/commit/5ec9955a0ed78b443f57a6f9f5e25cb6e9c82341))


### Features

* HstColorShades ([cc5be5e](https://github.com/Akryum/histoire/commit/cc5be5eb2de542d03c26e9671396c4e4f8cc851a))
* HstCopyIcon ([3ff66ae](https://github.com/Akryum/histoire/commit/3ff66ae6ac061cb8fbf4420d6e3a62056a6b1c8f))
* icon style improvements ([d7afeee](https://github.com/Akryum/histoire/commit/d7afeee72f5f9e0c1b55905120bdec814cb2fb92))
* Preview snap (fix [#54](https://github.com/Akryum/histoire/issues/54)) ([#65](https://github.com/Akryum/histoire/issues/65)) ([c53cc5c](https://github.com/Akryum/histoire/commit/c53cc5cb41ec34b9b948b4a80a5d23975ceb821c))
* **story:** reponsiveDisabled ([44ebf15](https://github.com/Akryum/histoire/commit/44ebf15d2381217ebce02ad1292ec95c7c69fc30))
* ugprade deps ([71948e3](https://github.com/Akryum/histoire/commit/71948e38d1ae87a4c0bbedf17d5d34f5a511ed8f))
* **vue3:** codegen v-for support ([e1c5d0e](https://github.com/Akryum/histoire/commit/e1c5d0edf79b3362911a5c0a6aee45bef128db5d))



## [0.2.2](https://github.com/Akryum/histoire/compare/v0.2.1...v0.2.2) (2022-04-04)


### Bug Fixes

* app logo horizontal align ([24f510b](https://github.com/Akryum/histoire/commit/24f510bb0372d5944854c6006f50038fe1c0ab38))
* app logo vertical align ([76e2890](https://github.com/Akryum/histoire/commit/76e289078405ddcc21c23e785e84c891db507c2d))
* improved vnode handling in <Story> ([fd1e6f1](https://github.com/Akryum/histoire/commit/fd1e6f16c3ab566e80bc03509d39702ee6d43e24))
* rem issue ([7854104](https://github.com/Akryum/histoire/commit/7854104c50abe388d74db0a8c88d1ec3004f6114))


### Features

* Add documentation (fix [#44](https://github.com/Akryum/histoire/issues/44)) ([#60](https://github.com/Akryum/histoire/issues/60)) ([a1a3b3a](https://github.com/Akryum/histoire/commit/a1a3b3a00476888d5d365a2872907817e4afa34c))
* **grid:** auto scroll to selected variant ([60bf849](https://github.com/Akryum/histoire/commit/60bf849d494f79be3089dee7d07278ac6f690adf))
* **grid:** select variant on click or keyup inside ([17e9204](https://github.com/Akryum/histoire/commit/17e92048f6a95ef2816fcdd43b9b9bdf2ef0ab36))
* optimize big grids ([488bda0](https://github.com/Akryum/histoire/commit/488bda0a6878058c246ad4859fd86d983018b7b9))


### Performance Improvements

* grid layout ([218f856](https://github.com/Akryum/histoire/commit/218f8564cda736582dc5384be2711101fa2bee9d))



## [0.2.1](https://github.com/Akryum/histoire/compare/v0.2.0...v0.2.1) (2022-03-22)


### Features

* Handle files and folders title conflict (fix [#57](https://github.com/Akryum/histoire/issues/57)) ([#58](https://github.com/Akryum/histoire/issues/58)) ([4d21425](https://github.com/Akryum/histoire/commit/4d21425c9e45438467db1fa268c52cc2fff6cd68))
* Open in new tab (fix [#52](https://github.com/Akryum/histoire/issues/52)) ([#59](https://github.com/Akryum/histoire/issues/59)) ([93a5095](https://github.com/Akryum/histoire/commit/93a5095357b7ea2884f7281731dc63b83df5f6f7))



# [0.2.0](https://github.com/Akryum/histoire/compare/v0.1.5...v0.2.0) (2022-03-20)


### Bug Fixes

* improve controls border colors ([e76c1f6](https://github.com/Akryum/histoire/commit/e76c1f635ed6ace2f7f08c344dbbcb146c4f70df))
* move server-side story exec to worker, closes [#56](https://github.com/Akryum/histoire/issues/56) ([d0a2cc9](https://github.com/Akryum/histoire/commit/d0a2cc9705d4c7ac4d3a64f8a061efd6545666ae))
* **search:** initial focus ([3a19f8b](https://github.com/Akryum/histoire/commit/3a19f8bb6a04ce108fc7de5c6de8cc0eec24d4bf))


### Features

* **cli:** preview command ([d82e852](https://github.com/Akryum/histoire/commit/d82e852813612eac54b647ef9aebe400cbe78fd7))
* Controls refacto + add number and textarea (fix [#30](https://github.com/Akryum/histoire/issues/30)) ([#55](https://github.com/Akryum/histoire/issues/55)) ([96fd481](https://github.com/Akryum/histoire/commit/96fd481352629f5189ca168e6c2194cf5182eb8c))
* improved text controls ([613d6ac](https://github.com/Akryum/histoire/commit/613d6ac81c76d0557b06e41093a6c9ec2d81402d))
* upgrade vite-node ([deb1776](https://github.com/Akryum/histoire/commit/deb1776c7b39251ab5972766dd203c8ff4c65d6c))



## [0.1.5](https://github.com/Akryum/histoire/compare/v0.1.4...v0.1.5) (2022-03-17)


### Features

* add tree state saving (fix [#22](https://github.com/Akryum/histoire/issues/22)) ([#51](https://github.com/Akryum/histoire/issues/51)) ([96d1071](https://github.com/Akryum/histoire/commit/96d1071bfb11daa80375d2a655df26c2ad064208))



## [0.1.4](https://github.com/Akryum/histoire/compare/v0.1.3...v0.1.4) (2022-03-17)


### Bug Fixes

* **mobile:** bigger hit targets in select lists ([9af124a](https://github.com/Akryum/histoire/commit/9af124a760769dd7f19267e4d8dbbcfb3d4d7e81))


### Features

* add responsive design (fix [#33](https://github.com/Akryum/histoire/issues/33)) ([#47](https://github.com/Akryum/histoire/issues/47)) ([17ff259](https://github.com/Akryum/histoire/commit/17ff259aa88614b8500f0611547ffd8d18a55f0c))
* support resizing with touch ([1cbc1ae](https://github.com/Akryum/histoire/commit/1cbc1ae0f0d18acc34c183f27e6dfd968e060f1d))
* update hatched pattern ([#49](https://github.com/Akryum/histoire/issues/49)) ([4cf9a50](https://github.com/Akryum/histoire/commit/4cf9a5026ec181ddc750b82bd8094f5616670f6e))



## [0.1.3](https://github.com/Akryum/histoire/compare/v0.1.2...v0.1.3) (2022-03-16)


### Bug Fixes

* responsive view settings update ([4e4bfe4](https://github.com/Akryum/histoire/commit/4e4bfe4a191a77c2aad007eab278dd8087e1de93))
* **responsive:** resizing while rotated ([9e53d83](https://github.com/Akryum/histoire/commit/9e53d834acc15063501406f122164dab949ef137))
* storage glitch (upgrade vueuse) ([8f99248](https://github.com/Akryum/histoire/commit/8f99248b776471793b9fe5b9a6b2eba9c5879801))



## [0.1.2](https://github.com/Akryum/histoire/compare/v0.1.1...v0.1.2) (2022-03-16)


### Bug Fixes

* **build:** default vite chunks not correct ([b05a35a](https://github.com/Akryum/histoire/commit/b05a35a13cd6ca374d93971841e9952e43b6563e))
* remove unnecessary peer dep ([7a4c333](https://github.com/Akryum/histoire/commit/7a4c333091064c203f64244f1749ae67d6c88aae))



## [0.1.1](https://github.com/Akryum/histoire/compare/v0.1.0...v0.1.1) (2022-03-16)


### Bug Fixes

* build errors with pnpm, closes [#42](https://github.com/Akryum/histoire/issues/42) ([67103d8](https://github.com/Akryum/histoire/commit/67103d8a9e71f2dbad4760d18f7b0b483e17bcb9))



# [0.1.0](https://github.com/Akryum/histoire/compare/v0.0.5...v0.1.0) (2022-03-16)


### Bug Fixes

* default storyIgnored ([e2af9de](https://github.com/Akryum/histoire/commit/e2af9de5ce51cd65dfd1ac8ca238b82d05076ff0))
* deps on @vue/runtime-core ([756a446](https://github.com/Akryum/histoire/commit/756a446d71f234438facc7f0adc9cdb821c94a1d))
* vite errors ([6ff6861](https://github.com/Akryum/histoire/commit/6ff6861ee0d954931d7d778ddebce0ceeac51d95))



## [0.0.5](https://github.com/Akryum/histoire/compare/v0.0.4...v0.0.5) (2022-03-15)


### Features

* **build:** optimize scripts loading ([65ee5e5](https://github.com/Akryum/histoire/commit/65ee5e5e8130cf50ba8f605efb6c76269acf9659))



## [0.0.4](https://github.com/Akryum/histoire/compare/v0.0.3...v0.0.4) (2022-03-15)


### Bug Fixes

* **build:** not handling custom blocks ([2f60fd8](https://github.com/Akryum/histoire/commit/2f60fd897b457c1c90b03afb263334845c2bd594))
* checkbox size ([59ea8df](https://github.com/Akryum/histoire/commit/59ea8df7ed71708982ec2c10883a1d35c6d09307))
* **codegen:** dynamicProps can be null ([eaeb919](https://github.com/Akryum/histoire/commit/eaeb9193a998346aeaa6a9bfbbae2b21a1f35b55))
* controls component not found warnings on server ([b16d7ad](https://github.com/Akryum/histoire/commit/b16d7ad173f4040d2440d52981237bf6e9bc99bd))
* controls components name ([dab555a](https://github.com/Akryum/histoire/commit/dab555aee306d5605368af53404fb94ccc651682))
* **controls:** book dark text color ([419cb1b](https://github.com/Akryum/histoire/commit/419cb1ba5a03d9ffa975952bd6d87e45db5e5f9f))
* display loading while variant is not ready ([6488c6b](https://github.com/Akryum/histoire/commit/6488c6b345434ce98e9891a24b614601b39a9072))
* **docs:** support dark mode ([cba01f1](https://github.com/Akryum/histoire/commit/cba01f177f5335fd8fcc3cd5ea16136351cb083c))
* improved ready state ([1bb0d3f](https://github.com/Akryum/histoire/commit/1bb0d3fc9baae7460e5599cd086941d31abce7e8))
* infinite sync loop ([59512a6](https://github.com/Akryum/histoire/commit/59512a655e937489b28814f2f8808f7ec8274756))
* selected item colors ([c99eea0](https://github.com/Akryum/histoire/commit/c99eea0100a934b63e19eba3b6afc968267dfe76))
* simpler css bind ([a9c8122](https://github.com/Akryum/histoire/commit/a9c8122459c79ed50ef7cc657773b2e169b1bb23))
* state with nested objects ([e9108df](https://github.com/Akryum/histoire/commit/e9108df0c14dff0b6205392ef057491fe06ad69e))
* unwanted scroll on Firefox ([7f6f898](https://github.com/Akryum/histoire/commit/7f6f8983d01e33f9907755bd46afb917bd919647))


### Features

* auto scroll list item into view ([3e11dda](https://github.com/Akryum/histoire/commit/3e11ddaa9c0cc521099ba09392c76a4e300a8462))
* **build:** result logs ([0648d58](https://github.com/Akryum/histoire/commit/0648d581dc4b6429299a9811b886d55a5785ca92))
* **codegen:** improved v-model ([ce40e8e](https://github.com/Akryum/histoire/commit/ce40e8e0ac770e38d6fa83b436f7fb3148abaa6d))
* **config:** vite as function to mutate config ([d39ca90](https://github.com/Akryum/histoire/commit/d39ca90599a51e07db36fe9d91301ebe518ce00b))
* initial builtin controls package, [#30](https://github.com/Akryum/histoire/issues/30) ([eb47193](https://github.com/Akryum/histoire/commit/eb47193b8157ae8ded81ee175312e5099047269a))
* logoHref ([d6ef6f2](https://github.com/Akryum/histoire/commit/d6ef6f274c482c54670e98d9502ad29c9f91047a))
* new responsive view with height ([5f49d67](https://github.com/Akryum/histoire/commit/5f49d671884d20ae5bf11e1bbff14c622b044b98))
* optional <Variant>, closes [#38](https://github.com/Akryum/histoire/issues/38) ([1c3af6c](https://github.com/Akryum/histoire/commit/1c3af6ca50e99d414da9f2ab353842c892c3fbe4))
* preview background + checkerboard ([23f2808](https://github.com/Akryum/histoire/commit/23f2808f435258efe128270558a420f097dc047b))
* preview dark mode class + transparent bg ([56a5ec3](https://github.com/Akryum/histoire/commit/56a5ec3aed11bdccb9bcf90b43a15a20abd0df39))
* **search:** improve auto scroll ([29c20fe](https://github.com/Akryum/histoire/commit/29c20fecc650b75d264d493ed8a8cbbea869d925))
* story markdown docs ([403e0b7](https://github.com/Akryum/histoire/commit/403e0b768629d0a4392e0b7462264a3aa9496a10))
* variant.ready ([efd56b3](https://github.com/Akryum/histoire/commit/efd56b3e9f5ff6670c142f0e8ee99fca4f3c2e19))



## [0.0.3](https://github.com/Akryum/histoire/compare/v0.0.2...v0.0.3) (2022-02-23)


### Bug Fixes

* responsive selected dark style ([771bdfb](https://github.com/Akryum/histoire/commit/771bdfbba5fdd7e7486d3fe000f2ac81eab86f20))
* restore last selected variant on stories HMR ([bf25e84](https://github.com/Akryum/histoire/commit/bf25e84d521af7e6bd6874e1868949be10c01d02))
* search dark style ([d598906](https://github.com/Akryum/histoire/commit/d59890657e81cb096619455001104d6ace6b9bf0))


### Features

* **config:** vite config override, closes [#25](https://github.com/Akryum/histoire/issues/25) ([8dcc6e7](https://github.com/Akryum/histoire/commit/8dcc6e7de0a4c81975e9d59c8262743e18277678))
* responsive presets, closes [#37](https://github.com/Akryum/histoire/issues/37) ([a27f8cf](https://github.com/Akryum/histoire/commit/a27f8cfd4b4c84c117989cf2e354fcbd9ebdffb2))
* restart on config change, closes [#28](https://github.com/Akryum/histoire/issues/28) ([ae7d47c](https://github.com/Akryum/histoire/commit/ae7d47cea3bf566bf3439f9fd2ea175166c9fb7f))



## [0.0.2](https://github.com/Akryum/histoire/compare/v0.0.1...v0.0.2) (2022-02-22)


### Features

* Add missing gray shades (fix [#35](https://github.com/Akryum/histoire/issues/35)) ([#39](https://github.com/Akryum/histoire/issues/39)) ([389eb18](https://github.com/Akryum/histoire/commit/389eb18d78fc996edad0a7b13720e8c993daa9f9))
* Auto expand parent folders of selected story (fix [#29](https://github.com/Akryum/histoire/issues/29)) ([#36](https://github.com/Akryum/histoire/issues/36)) ([09727f4](https://github.com/Akryum/histoire/commit/09727f437ae0cf703b03397033c46c5487f100c3))



## [0.0.1](https://github.com/Akryum/histoire/compare/105b9433214bb343a6c251bac4af0758d4d2bd47...v0.0.1) (2022-02-18)


### Bug Fixes

* **a11y:** improve tree a11y ([476e448](https://github.com/Akryum/histoire/commit/476e448e6b400a39b34063c67a165fadd1e9d01d))
* active link color ([3fecd68](https://github.com/Akryum/histoire/commit/3fecd68f6cfa90a2a3501b6efa5dd848e508a29a))
* Add absolude import using pathe ([#3](https://github.com/Akryum/histoire/issues/3)) ([2ed7d42](https://github.com/Akryum/histoire/commit/2ed7d4210b364c94b76846d991bf013e6a8c6c0f))
* add fille to built components to infer tag name ([a1ace24](https://github.com/Akryum/histoire/commit/a1ace24fc530848dbb4fe9dc81a8757b5392112e))
* allow both config file + vite config ([c275413](https://github.com/Akryum/histoire/commit/c2754131f068372cdd618232bb12ca276e7e2f3b))
* better default responsive width ([fbda1c5](https://github.com/Akryum/histoire/commit/fbda1c533042edff923e60913892395050953973))
* **build:** support custom logos ([7c7eec6](https://github.com/Akryum/histoire/commit/7c7eec6ddff74615b3956dbc4f37d7e97365571f))
* center responsive dragger ([cc0154f](https://github.com/Akryum/histoire/commit/cc0154f869efb57e6ccc21ae356b2c5481afe192))
* codegen ([db89569](https://github.com/Akryum/histoire/commit/db895696bf1333824b40f4a6b5e9aabbeeb02f27))
* console log override first arg can be a non-string ([2126965](https://github.com/Akryum/histoire/commit/2126965e4c0daec976007a2df926f5da37e92421))
* dark mode fixes ([73a80e8](https://github.com/Akryum/histoire/commit/73a80e86d368a7eb2ff1304b50c2eb7c8833a000))
* disable text select for a and button ([f107c9c](https://github.com/Akryum/histoire/commit/f107c9c7a5cf09a199ca0fdb8afd062f68832f1a))
* disable text selection in folder item ([3057a8d](https://github.com/Akryum/histoire/commit/3057a8d4c9f51462660f32b5225df63cd4d8d325))
* grid variant item text not selectable ([3a96827](https://github.com/Akryum/histoire/commit/3a96827ed1895deafa32e4fa7efb2393d821b8d1))
* import path ([7abc630](https://github.com/Akryum/histoire/commit/7abc630c7af2ffd38423459177d7b7c7e975a663))
* include default tailwind colors ([15261d6](https://github.com/Akryum/histoire/commit/15261d675d8f051ac1c35c4bf92bf43595f30ee5))
* init state sometimes not being taken into account ([fb9c775](https://github.com/Akryum/histoire/commit/fb9c775491c19d2ad0f46ab8197b861fcd9ce28c))
* input style ([563daf6](https://github.com/Akryum/histoire/commit/563daf6933c73f80f339db4d3295b90b85beacc5))
* Leaking absolute path (fix [#4](https://github.com/Akryum/histoire/issues/4)) ([#11](https://github.com/Akryum/histoire/issues/11)) ([204e06b](https://github.com/Akryum/histoire/commit/204e06b59891ebd7ec5ba10f722eda54e6a0f486))
* list items shrinking ([9cee043](https://github.com/Akryum/histoire/commit/9cee0436b4dbe3771094304a25ac078a63551a93))
* min responsive width ([b00e50d](https://github.com/Akryum/histoire/commit/b00e50da1fcff0c0ecb5d99d0b96679aa7e9dbf3))
* null error ([40f1582](https://github.com/Akryum/histoire/commit/40f158222127404a36c88072b530c9add749304d))
* reset keys on window blur ([112519f](https://github.com/Akryum/histoire/commit/112519f6b0a29e940c50d0b17ddfbf61d29f64d7))
* respect vite root + no duplicate vue plugin ([ec2001c](https://github.com/Akryum/histoire/commit/ec2001c3b52287b158bdcd096e108c24b7081fd3))
* router used before declaration ([20b4c56](https://github.com/Akryum/histoire/commit/20b4c56a5629ea5751d5c5591b62f413289f1a18))
* **search:** prevent default keyboard shortcut ([55db756](https://github.com/Akryum/histoire/commit/55db75614abc56f1b0996a16b441642cf3e6e600))
* source code textarea overflowing ([13a8d0b](https://github.com/Akryum/histoire/commit/13a8d0bde4efba9a3a0abdd9605b16efed808a47))
* story item right padding ([0005160](https://github.com/Akryum/histoire/commit/0005160f5a789f88d09521f969991357c79246ed))
* story list overflow ([2f338d2](https://github.com/Akryum/histoire/commit/2f338d274d0210549c19815be9ccf64282620b50))
* use JSON.stringify for dynamic prop ([036654b](https://github.com/Akryum/histoire/commit/036654b0056872559e21376898290be00c59986e))
* wrong serialize js indent size ([3096e90](https://github.com/Akryum/histoire/commit/3096e9097470da4b9efe55973f01f7edb8ea991b))


### Features

* Add dark mode (fix [#2](https://github.com/Akryum/histoire/issues/2)) ([#12](https://github.com/Akryum/histoire/issues/12)) ([b6535b1](https://github.com/Akryum/histoire/commit/b6535b10d4461e5e1f3aeb1e2686f411fff273d9))
* Add story tree UI (fix [#16](https://github.com/Akryum/histoire/issues/16)) ([#19](https://github.com/Akryum/histoire/issues/19)) ([9881810](https://github.com/Akryum/histoire/commit/98818106db6bbe217d91923ebf238ea56f97005d))
* Add vite config ([#18](https://github.com/Akryum/histoire/issues/18)) ([#23](https://github.com/Akryum/histoire/issues/23)) ([8a088e2](https://github.com/Akryum/histoire/commit/8a088e24de39def843e3ed526f399e90a060455e))
* Auto select single variant (fix [#10](https://github.com/Akryum/histoire/issues/10)) ([#26](https://github.com/Akryum/histoire/issues/26)) ([dba8176](https://github.com/Akryum/histoire/commit/dba8176d4dfd869d58dc6e11958680279ca980d7))
* BaseListItemLinkg + improved style ([af395e9](https://github.com/Akryum/histoire/commit/af395e9e32e3d544238aaf27077ae1227582cf0e))
* basic search ([5d8cc76](https://github.com/Akryum/histoire/commit/5d8cc76032ca70228a937ae2e790451347b4cd6c))
* basic vue3 source code ([debf73e](https://github.com/Akryum/histoire/commit/debf73ed17d4584d8137d58307606d1583d7f91f))
* build command ([9f99909](https://github.com/Akryum/histoire/commit/9f99909e9d8c9779fcb7f570b0c9dd224be0ef49))
* collect stories/variants node-side instead of client-side ([2876a9a](https://github.com/Akryum/histoire/commit/2876a9a69dab1baf396987ac1a7530d5d7784070))
* config file, closes [#17](https://github.com/Akryum/histoire/issues/17) ([70dde60](https://github.com/Akryum/histoire/commit/70dde60244fc7e21f0be4d220faeb3de7ff06890))
* copy source button ([f928e9a](https://github.com/Akryum/histoire/commit/f928e9af0e1d4dca78dbb88819f6a5f70ec169bc))
* custom story/variant icon colors ([e48bfb0](https://github.com/Akryum/histoire/commit/e48bfb02769124dff7241b1b43609b3fa5485031))
* custom story/variant icons ([02a3121](https://github.com/Akryum/histoire/commit/02a312143a4c36784db25ed420af8f5da7316e39))
* customizable colors ([bdd8f09](https://github.com/Akryum/histoire/commit/bdd8f092c22871706d36f1e30c7a126af385be05))
* default variant title ([fe71046](https://github.com/Akryum/histoire/commit/fe71046c037d6a0b9523e37e9ffa90efcb25177c))
* don't crash on execution error while collecting stories ([b93e2db](https://github.com/Akryum/histoire/commit/b93e2dbd9bc8e699c171a2cf085d0e895f46080c))
* emrald as primary color ([1c4798e](https://github.com/Akryum/histoire/commit/1c4798e755fa5660b79c18f583b2233066ed5921))
* finish basic theme + example ([ee074e0](https://github.com/Akryum/histoire/commit/ee074e0b8ea8141ec4ca52e14d423400061de1ae))
* hatched pattern in responsive view ([f312393](https://github.com/Akryum/histoire/commit/f31239393e4efc27ec0d824c78abbb254a2cd724))
* histoire logo ([e180153](https://github.com/Akryum/histoire/commit/e18015373bc9d9d5eee7048c5f9d90e15ed17ecb))
* icons in variants grid ([0ef0928](https://github.com/Akryum/histoire/commit/0ef092869ed2a09a06fb965bf8d4db2657b45096))
* improved code style ([fabf3ad](https://github.com/Akryum/histoire/commit/fabf3ad3367c2463d07e909c0641e8b32f3176e1))
* improved generated code ([ce320c0](https://github.com/Akryum/histoire/commit/ce320c02d5b3fd9014077f001bc7bd43c4bdc017))
* improved JS serialization and Vue 3 codegen ([5c2e10c](https://github.com/Akryum/histoire/commit/5c2e10c3bfdf6c5127a83df22193f66c37c47d95))
* improved keyboard tooltips ([3a02e6a](https://github.com/Akryum/histoire/commit/3a02e6a692915ffa6c20552b8d518a9b8ab29af0))
* improved search result design ([9a4f199](https://github.com/Akryum/histoire/commit/9a4f19929943bb5543b82c358b36072d32c1a6db))
* improved search with path matching and ranking ([cd0ad9c](https://github.com/Akryum/histoire/commit/cd0ad9c9d80cbf532c61fd256194e3d0a6a84e86))
* keyboard shortcut system + toggle dark tooltip/shortcut ([1ebfeb7](https://github.com/Akryum/histoire/commit/1ebfeb7492217a8813db210ad2b8fe539f1bcabf))
* no controls available fallback ([253f3b9](https://github.com/Akryum/histoire/commit/253f3b99e885d830cf287fdb060844c79db07356))
* page title ([2d84c72](https://github.com/Akryum/histoire/commit/2d84c727e72c26a92022083737029b8d3c14ea7e))
* pixel split responsive view ([c4277de](https://github.com/Akryum/histoire/commit/c4277ded50fb8195a21497bef4ccc608fbd16e1c))
* poc ([105b943](https://github.com/Akryum/histoire/commit/105b9433214bb343a6c251bac4af0758d4d2bd47))
* re-collect stories on page refresh ([3e93f62](https://github.com/Akryum/histoire/commit/3e93f62379aa32b8797622016455ace8cf1c279d))
* remove border below app header ([d934b97](https://github.com/Akryum/histoire/commit/d934b976ab337ba4c72db294aee272bfa9406358))
* reponsive width input ([c303a47](https://github.com/Akryum/histoire/commit/c303a47c850bf8113b0397054219ed4ad4742805))
* reworked colors ([1cf0f76](https://github.com/Akryum/histoire/commit/1cf0f76589ae5a40d68fe43f13beed0ddd63e77e))
* rounded iframe ([2e23b6b](https://github.com/Akryum/histoire/commit/2e23b6b5b9b970b3c19d8684fa79f2b24e93bea7))
* rounded list items ([a6d1152](https://github.com/Akryum/histoire/commit/a6d115242c49106154f707ffd73356484db62350))
* **search:** escape key to close ([5272085](https://github.com/Akryum/histoire/commit/52720850b46a49a1b24097a793242cf068c51e1c))
* **search:** match variant for matched story ([b5ee443](https://github.com/Akryum/histoire/commit/b5ee4437057d09a630308af141a9eb7748d21748))
* setupFile, closes [#24](https://github.com/Akryum/histoire/issues/24) ([397b362](https://github.com/Akryum/histoire/commit/397b3625808eb42887d3b4e65f6ef4e5367d1e6c))
* smaller app header ([8b4784c](https://github.com/Akryum/histoire/commit/8b4784ccddc13dd6aa39a526b9a0a23d07683c81))
* storyIgnored (fix macos issue) ([12efce3](https://github.com/Akryum/histoire/commit/12efce3e9ea8de49d0e2bd20d83c98fd89bff6a5))
* synchornize variant state with iframe ([9d5b969](https://github.com/Akryum/histoire/commit/9d5b969019321993093c457abbbdcbcc6e87caf2))
* syntax highlighting, close [#13](https://github.com/Akryum/histoire/issues/13) ([a2551f6](https://github.com/Akryum/histoire/commit/a2551f6f1b7b511a480f0f20cd17c6bee45a0b64))
* use iframe in single view, closes [#9](https://github.com/Akryum/histoire/issues/9) ([dd65fa7](https://github.com/Akryum/histoire/commit/dd65fa77a696c1c516c09b94e5e4738f8c1f0857))
* use knitwork for js object serialization ([6d8685c](https://github.com/Akryum/histoire/commit/6d8685c67e844cbebf939005720eef9fe766f66f))
* variant hand-written source ([43ed14e](https://github.com/Akryum/histoire/commit/43ed14e66cb37cc9d2dc41d55371b1047bb32d2c))
* variant list item icon ([e74e297](https://github.com/Akryum/histoire/commit/e74e297219a98d8e474713beab1f1c51997c2fd0))
* vite as peer dep ([3461064](https://github.com/Akryum/histoire/commit/3461064a7997c8bb74e2d44b85b5fb720c62098d))
* vue3 codegen: slot props ([c4fb99f](https://github.com/Akryum/histoire/commit/c4fb99f5945856493b5a2c1d5a407736229309f8))
* wip white label customization [#15](https://github.com/Akryum/histoire/issues/15) ([#27](https://github.com/Akryum/histoire/issues/27)) ([0b89dff](https://github.com/Akryum/histoire/commit/0b89dff50410f6e5a89811877b4c90fd61875580))



