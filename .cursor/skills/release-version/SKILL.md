---
name: release-version
description: >-
  Bumps Weave EPUB Reader release metadata, commits it, and creates the
  matching git tag so the tag-triggered GitHub Release workflow can publish.
  Use when the user asks to 发版, 发布, 打标签, bump the version, or update
  manifest.json, package.json version, or versions.json for a release.
---

# Release version

The Release workflow does not edit version files and does not create tags. This skill does that, then pushes the tag so Actions builds and publishes the GitHub Release.

Version strings are `x.y.z` with no `v` prefix. The tag name, `manifest.json` `version`, and `package.json` `version` must be identical. `versions.json` must contain that key.

## Decide the version

Use the version the user names. If they ask to release without a number, increment the patch component of the current `manifest.json` `version`. Do not change `minAppVersion` unless they ask.

## Update files

On the commit that should be released:

1. Set `version` in `manifest.json` and `package.json`. Leave every other field unchanged.
2. In `versions.json`, add `"<version>": "<manifest.minAppVersion>"` only when that key is missing. Append it; do not rewrite older entries.
3. If the user supplied release notes, write them to `.github/release-notes/<version>.md`. Otherwise leave notes absent. The workflow generates a short default body.

Do not run `scripts/sync-obsidian-community-version.cjs` for this. That script publishes version metadata onto `main` from a clean remote branch and omits the release commit.

## Commit, tag, push

Commit only `manifest.json`, `package.json`, `versions.json`, and release notes when those files changed. Do not stage unrelated work.

Commit message:

```
Sync version metadata on main to <version> for Obsidian community updates.
```

Create an annotated tag on that commit:

```bash
git tag -a <version> -m "<version>"
```

Push only after the user asked to release or publish:

```bash
git push origin HEAD
git push origin <version>
```

Do not force-push and do not move an existing tag. If `<version>` already exists locally or on `origin`, stop and say so.

Before pushing, confirm this commit's `.github/workflows/release.yml` triggers on `push` tags matching `[0-9]+.[0-9]+.[0-9]+`. A tag whose commit lacks that trigger will not publish.

After the tag push, report the tag and that Actions will build `main.js`, `manifest.json`, and `styles.css` onto the GitHub Release. Do not create the Release locally.
