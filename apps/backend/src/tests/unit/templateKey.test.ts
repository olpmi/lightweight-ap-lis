/**
 * In dev-file mode a template key is a path under TEMPLATE_SOURCE_DIR, so it
 * must stay a plain list of file-name segments. The accepted shapes are the
 * ones the built-in catalog already uses.
 */
import { describe, it, expect } from 'vitest';
import { assertSafeTemplateKey } from '../../services/config.service.js';
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
