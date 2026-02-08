# GitHub Copilot Instructions

This document provides guidance for GitHub Copilot when working on the Gnosis
VPN UI application.

## Project Overview

- **Framework**: Solid.js (frontend) + Tauri (desktop wrapper)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Target**: Cross-platform desktop application (using Tauri)

## Code Style & Standards

### TypeScript

- Use strict mode (enabled in tsconfig.json)
- Type all function parameters and return values
- Avoid `any` types; use proper TypeScript interfaces
- Use path aliases: `@src/*` for `/src/*`, `@assets/*` for `/src/assets/*`

### Solid.js

- Prefer functional components with JSX syntax
- Use reactive primitives: `createSignal`, `createEffect`, `createMemo`
- Avoid unnecessary re-renders; leverage Solid's fine-grained reactivity
- Use `<Show>`, `<For>`, and `<Switch>` for conditional rendering
- Keep components focused and reusable

### Styling

- Use Tailwind CSS utility classes for all styling
- Avoid inline styles or CSS modules unless absolutely necessary
- Follow Tailwind's responsive design patterns (`sm:`, `md:`, `lg:`, etc.)

### Code Quality

- Keep functions small and focused (single responsibility principle)
- Export only what's necessary from modules
- Add JSDoc comments for public APIs and complex logic
- Use descriptive variable and function names
- Avoid magic numbers; use named constants

## Tauri Integration

- Use `@tauri-apps/api` for system interactions
- Respect Tauri's security model (validate all backend calls)
- Use the plugin system for extended functionality (store, dialog, opener)
- Ensure frontend and backend communication is properly typed

## Testing Expectations

- Write tests for utility functions and hooks
- Cover edge cases in business logic
- Keep tests readable and maintainable
- Mock Tauri APIs when unit testing frontend components

## File Organization

```
src/
├── components/     # Reusable UI components
├── pages/         # Page-level components
├── hooks/         # Custom Solid.js hooks
├── utils/         # Utility functions
├── types/         # TypeScript interfaces and types
├── assets/        # Images, fonts, etc.
└── App.tsx        # Root component
```

## Common Patterns

### Creating a Component

```typescript
import { defineComponent } from "solid-js";

interface Props {
  title: string;
  onClick?: () => void;
}

export const MyComponent = (props: Props) => {
  return (
    <div class="flex items-center justify-center">
      <h1 class="text-lg font-bold">{props.title}</h1>
    </div>
  );
};
```

### Using Signals

```typescript
import { createSignal } from "solid-js";

const MyComponent = () => {
  const [count, setCount] = createSignal(0);

  return (
    <button onClick={() => setCount(count() + 1)}>
      Count: {count()}
    </button>
  );
};
```

## Do's and Don'ts

### Do

- Use TypeScript strict mode
- Implement proper error handling
- Keep components pure and testable
- Use semantic HTML elements
- Document complex logic with comments

### Don't

- Use `any` types
- Create deeply nested component trees without extracting sub-components
- Mix styling approaches (stick to Tailwind)
- Mutate state directly (use signals/stores)
- Ignore TypeScript errors

## Import Path Aliases

Always use configured path aliases:

- `import { Component } from '@src/components/Component'`
- `import logo from '@assets/logo.svg'`

## Git & PR Practices

Follow project Git standards as defined in AGENTS.md for commit messages and
code reviews.

### Pull Requests

- **Linting**: Always ensure linting passes before submitting a PR. Run
  `nix develop --command deno lint --fix` locally to catch and fix issues.
- **PR Title**: Keep the PR title clear, descriptive, and aligned with the
  actual changes included.
- **PR Description**: Update the description to accurately reflect the full
  scope of changes. Include:
  - What was changed and why
  - Any breaking changes or side effects
  - Links to relevant issues or discussions
  - Testing instructions if applicable
- **Scope Alignment**: If the PR scope expands during development, update the
  title and description to match the final changes.
