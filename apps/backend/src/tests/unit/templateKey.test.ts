/**
 * In dev-file mode a template key is a path under TEMPLATE_SOURCE_DIR, so it
 * must stay a plain list of file-name segments. The accepted shapes are the
 * ones the built-in catalog already uses.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { assertSafeTemplateKey, resolveTemplateStem } from '../../services/config.service.js';
import { AppError } from '../../middleware/error.middleware.js';

describe('assertSafeTemplateKey', () => {
  it.each(['breast_cytology/breast_cytology', 'breast.histology/breast/colon_v1', 'breast-gross-fr', 'a'])(
    'accepts %s',
    (key) => {
      expect(() => assertSafeTemplateKey(key)).not.toThrow();
    }
  );

  it.each(['../x', 'a/../b', '/abs', 'a//b', 'a\\b', '', '.', 'a/', './a', 'a/.hidden'])(
    'rejects %s with a 400',
    (key) => {
      let caught: unknown;
      try {
        assertSafeTemplateKey(key);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect((caught as AppError).statusCode).toBe(400);
      expect((caught as AppError).code).toBe('INVALID_TEMPLATE_KEY');
    }
  );
});

describe('resolveTemplateStem', () => {
  const root = path.resolve('template-root');

  it('resolves a catalog-shaped key to a stem under the root', () => {
    expect(resolveTemplateStem(root, 'breast_cytology/breast_cytology')).toBe(
      path.join(root, 'breast_cytology', 'breast_cytology')
    );
  });

  it.each(['../outside', 'a/../../outside', path.resolve('elsewhere', 'x')])('refuses %s with a 400', (key) => {
    let caught: unknown;
    try {
      resolveTemplateStem(root, key);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).statusCode).toBe(400);
  });
});
