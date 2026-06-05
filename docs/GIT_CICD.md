# Git 与 CI/CD 流程

本文档记录 FlowMindStudio 当前 Git 仓库、分支、hook 和 GitHub Actions 的实际工作方式。新的对话或新的接手者可以优先阅读本文，直接理解如何提交、推送、合并和排查流水线。

## 仓库信息

- 本地仓库目录：`E:\FlowMindStudio`
- 远端仓库：`git@github.com:loseaa/flow-mind-studio.git`
- 主分支：`master`
- 功能分支示例：`feat/lowcode-canvas-pipeline`
- 包管理器：`pnpm@9.15.4`，通过 Corepack 管理

当前仓库已经配置：

```bash
git config core.hooksPath .githooks
```

如果重新 clone 仓库后 hook 没有生效，在项目根目录执行：

```bash
corepack pnpm prepare
```

## 分支策略

常规开发流程：

1. 从 `master` 创建功能分支。
2. 在功能分支开发并提交。
3. push 功能分支到远端。
4. merge 前执行完整校验。
5. 校验通过后 merge 到 `master`。
6. push `master`。

推荐命令：

```bash
git switch master
git pull --ff-only origin master
git switch -c feat/your-feature-name
```

提交功能：

```bash
git add .
git commit -m "feat: describe your change"
git push -u origin feat/your-feature-name
```

合并到主分支：

```bash
corepack pnpm verify:merge
git switch master
git pull --ff-only origin master
git merge --no-ff feat/your-feature-name -m "merge: describe your change"
git push origin master
```

如果功能分支落后于 `master`，先同步：

```bash
git switch feat/your-feature-name
git merge master --ff-only
git push
```

## 本地校验脚本

根目录 `package.json` 定义了统一校验入口：

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

组合脚本：

```bash
corepack pnpm verify:commit
corepack pnpm verify:push
corepack pnpm verify:merge
```

含义：

- `verify:commit`：提交前校验，执行 `lint + typecheck`
- `verify:push`：推送前校验，执行 `test`
- `verify:merge`：合并前完整校验，执行 `lint + typecheck + test + build`

## Git Hooks

hook 文件位于 `.githooks/`：

```text
.githooks/
  pre-commit
  pre-push
  pre-merge-commit
```

行为：

- `pre-commit` 自动执行 `corepack pnpm verify:commit`
- `pre-push` 自动执行 `corepack pnpm verify:push`
- `pre-merge-commit` 自动执行 `corepack pnpm verify:merge`

注意：

- hook 使用 shell 脚本，`.gitattributes` 已强制 `.githooks/*` 使用 LF 换行。
- 如果 Windows 提示 LF/CRLF，通常不影响已提交文件；不要把 hook 改成 CRLF。
- 如果需要临时跳过 hook，可以用 Git 原生命令参数，例如 `git commit --no-verify`，但只应在明确知道风险时使用。

## GitHub Actions

CI 文件：

```text
.github/workflows/ci.yml
```

触发条件：

- push 到 `master`
- push 到 `feat/**`
- push 到 `feature/**`
- pull request 目标分支为 `master`

CI 执行顺序：

1. Checkout
2. Setup pnpm
3. Setup Node.js
4. Enable Corepack
5. Install dependencies
6. Lint
7. Typecheck
8. Test
9. Build

关键配置：

```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v4
  with:
    version: 9.15.4
    run_install: false

- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: pnpm
    cache-dependency-path: pnpm-lock.yaml
```

必须先 `Setup pnpm`，再让 `actions/setup-node` 使用 `cache: pnpm`。如果顺序反了，GitHub Actions 会在 `Setup Node.js` 阶段报：

```text
Unable to locate executable file: pnpm
```

这是因为 `setup-node` 启用 pnpm 缓存时会立即从 PATH 查找 `pnpm`，而此时如果 pnpm 还没安装，就会失败。

## 常见问题

### CI 报找不到 pnpm

现象：

```text
Unable to locate executable file: pnpm
```

原因：

- workflow 中 `actions/setup-node` 使用了 `cache: pnpm`
- 但 `pnpm/action-setup` 没有在它之前执行
- 或者 PR 分支仍然使用旧版 workflow

处理：

```bash
git switch master
git pull --ff-only origin master
git switch feat/your-feature-name
git merge master --ff-only
git push
```

然后重新跑 GitHub Actions。

### PR 合并仍然跑旧 workflow

GitHub PR 校验通常会使用 PR 分支里的 workflow。即使 `master` 已修复，如果 feature 分支没有同步，也可能继续失败。

处理方式同上：把 `master` 快进同步到 feature 分支，并 push feature 分支。

### 本地 push 提示 GitHub SSH 连接失败

在当前 Codex 沙箱中，普通命令可能无法访问 GitHub SSH 22 端口，表现为：

```text
ssh: connect to host github.com port 22: Permission denied
```

这属于沙箱网络限制。需要使用提升权限重新执行 `git push`。在普通本机终端中，只要 SSH key 配置正常，一般不会遇到这个沙箱限制。

### Git 提示无法访问全局 ignore

当前环境可能出现：

```text
warning: unable to access 'C:\Users\songxy/.config/git/ignore': Permission denied
```

这是用户全局 Git ignore 文件权限问题，不影响当前仓库提交、合并和 push。仓库级忽略规则在 `.gitignore` 中。

## 当前已知状态

截至本文档编写时：

- `master` 已包含低代码画布编排和 CI/CD 配置。
- `feat/lowcode-canvas-pipeline` 已同步到 `master`。
- 本地 hook 已启用。
- 远端 `master` 和 feature 分支均已推送。
- 最近关键提交：
  - `357b10b feat: add low-code canvas pipeline`
  - `a1fbae9 merge: low-code canvas pipeline`
  - `7b216d4 fix: setup pnpm before ci cache`
