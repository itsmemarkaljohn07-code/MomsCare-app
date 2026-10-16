// Lets `node --test` load app sources whose relative imports have no
// extension (as Angular writes them), by trying the same path plus ".ts".
// Tests only; nothing here ships in the app.
// Use: node --import ./tests/unit/resolve-ts.mjs --test tests/unit/<file>.test.ts
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (err?.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});
