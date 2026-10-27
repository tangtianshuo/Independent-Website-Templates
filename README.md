# Storefront Templates

独立站模板源码仓库，集中维护模板清单、静态资源和对应的 Storefront 实现。包含 AeroFrame 1.0.0、1.0.1 和 1.0.2。公开索引由 `registry` 分支的 `registry/index.json` 提供，镜像使用不可变 digest。

## 环境与验证

需要 Node.js 22 和 npm。在仓库根目录运行：

```sh
npm ci
npm test
npm run validate
```

`npm run validate` 校验 1.0.2。要校验固定版本，运行：

```sh
node scripts/validate.mjs templates/<id>/<version>/template.json
```

单独验证 AeroFrame 的 Storefront：

```sh
cd templates/aeroframe/1.0.2/storefront
npm ci
npm test
npm run build
```

CI 会运行上述测试、清单校验和 Storefront 构建。推送 `release/vMAJOR.MINOR.PATCH` 分支会按清单版本发布镜像并同步到现有服务器；`aeroframe-vX.Y.Z` 标签仍兼容。`master` 和面向 `master` 的 PR 只运行验证。发布新版本前，将完整模板复制到新的版本目录，并同步更新清单、Storefront `package.json` 和 lockfile 版本。

## 目录结构

```text
schema/template.schema.json                 模板清单的 JSON Schema
scripts/validate.mjs                       清单与资源校验
scripts/publish.mjs                        发布记录逻辑（当前为内存存储接口）
templates/aeroframe/1.0.0/template.json    AeroFrame 版本清单
templates/aeroframe/1.0.0/assets/           清单引用的资源
templates/aeroframe/1.0.0/storefront/       Nuxt Storefront 实现
templates/aeroframe/1.0.0/Dockerfile        示例模板的镜像构建文件
test/                                      仓库级测试
```

## 新增或修改模板

1. 在 `templates/<id>/<version>/` 下放置 `template.json`、清单引用的资源和对应的 Storefront 实现。可参考现有 [AeroFrame 清单](templates/aeroframe/1.0.0/template.json)及 [Schema](schema/template.schema.json)。
2. 清单中的 `id`、`version` 应与目录一致；`version` 使用 `主版本.次版本.修订版本` 格式。为资源填写真实文件的 SHA-256 校验值和匹配的 MIME 类型。
3. 在仓库根目录执行 `node scripts/validate.mjs templates/<id>/<version>/template.json`、`npm test`，并在模板的 `storefront/` 目录运行测试与构建。

校验器除 Schema 外还会检查模型与字段引用、页面路由冲突、资源类型、文件路径、图片内容和 SHA-256。`npm run validate:1.0.0` 验证旧版清单，`npm run validate:1.0.1` 和 `npm run validate:1.0.2` 验证包含 CMS presentation 字段的发布清单。

## 发布状态

首次配置发布链路时，在 `registry` 分支创建 `registry/index.json`，初始内容为 `{ "schemaVersion": 1, "records": [] }`。该分支现已初始化。GitHub Actions 会运行验证与 Storefront 测试/构建，然后构建并推送 GHCR 镜像、生成并验证 GitHub provenance、检查匿名 digest 拉取，串行向 `registry` 分支追加不可变记录，最后让服务器预拉取并记录该模板镜像。此步骤只同步可用模板版本，不会自动更新任何活动站点；CMS 采用模板并发布站点后才会改变站点。

GHCR 新 package 默认可能是私有的。若首发包不可匿名读取，工作流会等待最多 30 分钟并保留构建 digest；仓库管理员需在 GitHub Packages 将 package `independent-website-templates/aeroframe` 改为 Public，然后重新运行同一 tag 的发布 workflow。确认匿名拉取通过后 workflow 才写入 available 索引。相同版本相同记录可重跑；相同 id/version 的任何身份变化都会失败，不能覆盖旧版本。

`1.0.1` 已在 `cad64f1` 发布且保持不变。首个版本分支发布为 `release/v1.0.2`；重试会复用同一提交及其 registry digest，版本身份或 digest 不同则拒绝覆盖。发布前可本地执行 `npm ci && npm test && npm run validate:1.0.0 && npm run validate:1.0.1 && npm run validate:1.0.2`，以及在所选版本的 `storefront/` 目录运行测试和构建。本地测试不代表远端发布成功。

2026-10-27 的 `npm ci` audit 报告 7 个 high findings，均来自构建依赖链 `listhen`/`nitropack`/`nuxt` 中的 `node-forge` 漏洞 GHSA-86w9-cpqp-85rv；检查时尚无可用的修复版本。生产镜像只复制 Nuxt `.output`，构建产物中不含 `node-forge` 或 `listhen`。后续升级依赖前应重新检查该公告。

## AeroFrame 1.0.1 发布结果

2026-10-27，发布流水线 `40436497040` 成功，GitHub 镜像包为 Public；从部署服务器用空 Docker 凭据目录完成匿名清单校验和镜像拉取。

- 源码：`cad64f168c6167c01250992d147c27c6c7fb1639`（标签 `aeroframe-v1.0.1`）。
- 清单：`sha256:cd9903e8adde04efc229c015d1ec16ba9e8fdda896c4b1e28ea0d95e3d421fb8`。
- 镜像：`ghcr.io/tangtianshuo/independent-website-templates/aeroframe@sha256:931b7e38882216deda60ac4060a9b76bbfb782426a1317c7b842727f0931a80a`。

镜像通过服务端站点凭据读取 Gateway schema v1 快照；不是无需 Gateway 即可独立运行的静态站点。MIT 许可证允许复用代码；演示文案和图片需要使用者按自己的业务替换。当前发布验证不代表完整生产运维验收。

## AeroFrame 1.0.2 版本分支发布结果

2026-10-27，`release/v1.0.2` 流水线 `40461390282` 已成功完成验证、镜像发布、provenance 验证、匿名拉取、registry 追加和服务器同步。

- 源码：`4f6e1a8d4558b610c395590537dc2891db109be6`。
- 镜像：`ghcr.io/tangtianshuo/independent-website-templates/aeroframe@sha256:8aaec8fb8d6c18a6435f3f1bbc06cdfe9ad5b49139850956e53374345c1d8b69`。
- 服务器回执：`/opt/novaintelligent/deploy/releases/templates.current.json`。

现有活动站点继续使用 AeroFrame 1.0.1，发布 1.0.2 没有替换站点容器或内容 Release。需要在 CMS 显式采用新模板版本并发布站点后才切换。
