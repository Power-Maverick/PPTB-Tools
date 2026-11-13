---
description: "Use when adding, writing, or updating test cases, tests, or test scripts in PPTB-Tools. Standardizes the test runner and test patterns across tools."
---
# Testing Guidelines

- Use Vitest for tests in PPTB tool packages so the repository converges on one test runner. Do not introduce Jest or Node's `node:test` for new tool tests unless explicitly requested or a package has a concrete compatibility constraint.
- Before adding tests, inspect the target tool's `package.json`, test files, and source modules. Follow its existing assertions and fixtures where useful, but prefer Vitest conventions for new tests.
- If the tool does not yet use Vitest, add it as a development dependency, add a `test` script using `vitest run`, and update that tool's npm shrinkwrap.
- Import TypeScript source directly in Vitest tests when practical. Prefer Vitest mocks and stubs over a custom VM/transpilation loader; retain an existing loader only when the code's module constraints require it.
- Keep tests focused on observable behavior and regression cases. Run the target tool's `npm test` and, when source or TypeScript configuration changes, its build or typecheck from that tool's directory.
