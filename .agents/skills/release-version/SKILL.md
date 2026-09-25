---
name: release-version
description: >-
  负责发版前的版本文件和 Git 标签。更新 manifest.json、package.json 的 version，
  补上 versions.json，提交后打上同名标签并推送，让打标签时的 GitHub Release
  工作流自动发布。用户提到发版、发布、打标签、升级版本，或要改
  manifest.json、versions.json、package.json 版本时使用。
---

# 发版版本

Release 工作流不会改版本文件，也不会创建标签。本技能完成这些步骤，再推送标签。Actions 会构建并发布 GitHub Release。

版本号是 `x.y.z`，不加 `v`。标签名、`manifest.json` 的 `version`、`package.json` 的 `version` 必须相同。`versions.json` 必须包含这个键。

## 确定版本

用用户指定的版本。用户只说发版、没给版本号时，把当前 `manifest.json` 的 `version` 补丁号加一。用户没要求时，不要改 `minAppVersion`。

## 更新文件

在要发布的那次提交上：

1. 只改 `manifest.json` 和 `package.json` 的 `version`，其他字段不动。
2. `versions.json` 里没有该版本时，在末尾追加 `"<version>": "<manifest.minAppVersion>"`。不要改已有条目。
3. 用户提供了发布说明时，写到 `.github/release-notes/<version>.md`。没提供就不要写。工作流会生成一段默认说明。

不要运行 `scripts/sync-obsidian-community-version.cjs`。那个脚本会从远程干净分支只推版本元数据，不包含这次要发布的提交。

## 提交、打标签、推送

只提交有改动的 `manifest.json`、`package.json`、`versions.json` 和发布说明。不要把无关改动放进这次提交。

提交说明：

```
Sync version metadata on main to <version> for Obsidian community updates.
```

在该提交上创建附注标签：

```bash
git tag -a <version> -m "<version>"
```

只有用户明确要求发版或发布时才推送：

```bash
git push origin HEAD
git push origin <version>
```

不要强推，也不要移动已有标签。本地或 `origin` 上已经有这个版本标签时，停下来并说明。

推送前确认这次提交里的 `.github/workflows/release.yml` 会在匹配 `[0-9]+.[0-9]+.[0-9]+` 的标签推送时触发。提交里没有这个触发器时，打标签不会自动发布。

标签推送后，告诉用户标签名，以及 Actions 会把 `main.js`、`manifest.json`、`styles.css` 传到对应的 GitHub Release。不要在本地创建 Release。
