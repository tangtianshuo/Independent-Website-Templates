# Storefront Templates

独立站模板源码仓库，集中维护模板清单、静态资源和对应的 Storefront 实现。当前包含 `aeroframe/1.0.0` 示例模板。模板按 ID 和版本组织；清单描述 CMS 内容模型、页面路由、资源及兼容版本，Storefront 负责渲染站点。当前仓库可用于本地开发和验证，尚不提供可供 CMS 直接导入的公开模板索引或已发布的容器镜像。

## 环境与验证

需要 Node.js 22 和 npm。在仓库根目录运行：

```sh
npm ci
npm test
npm run validate
```

`npm run validate` 当前校验 `templates/aeroframe/1.0.0/template.json`。要校验其他模板清单，运行：

```sh
node scripts/validate.mjs templates/<id>/<version>/template.json
```

单独验证 AeroFrame 的 Storefront：

```sh
cd templates/aeroframe/1.0.0/storefront
npm ci
npm test
npm run build
```

CI 会运行上述测试、清单校验和 Storefront 构建；当前工作流**仅验证，不发布**模板或容器镜像。

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

校验器除 Schema 外还会检查模型与字段引用、页面路由冲突、资源类型、文件路径、图片内容和 SHA-256。仓库根目录的 `npm run validate` 仍固定指向 AeroFrame；新增模板时须显式校验新清单，并按需更新自动化验证范围。

## 发布状态

仓库已有发布记录逻辑及相关测试，但使用的是内存存储接口；目前没有可供外部使用的公开模板索引，也没有自动推送 GHCR 镜像的工作流。请勿将本地验证通过视为模板已发布或可由 CMS 直接导入。
