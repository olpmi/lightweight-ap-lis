import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

/**
 * Testing Library's async utilities default to a 1000 ms timeout, which is not
 * enough headroom here.
 *
 * These suites mount whole pages behind React Query, and CI runs them under v8
 * coverage instrumentation, which roughly doubles their wall time: locally
 * ResultCasePage.test.tsx takes ~1.3 s plain and ~2.3 s with coverage, against a
 * budget of 1 s for the first `findByRole` in it. On a shared runner that tips
 * over, and a `findBy*` waiting on an already-resolved mock fails on machine
 * speed rather than on behaviour — reporting a missing element, which reads like
 * a regression in the component.
 *
 * Raising the ceiling does not weaken any assertion: the queries still have to
 * find what they are looking for, and a genuinely missing element still fails,
 * just later. The alternative — passing `{ timeout }` at each call site — would
 * have to be repeated on every new async query and would be forgotten.
 */
configure({ asyncUtilTimeout: 5000 });
