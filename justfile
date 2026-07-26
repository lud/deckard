install:
    npm install

test:
    node --test

# Enforces the // @ts-check + JSDoc annotations the scripts already carry.
# --noEmit is explicit so this recipe can never write build artifacts into
# plugin/, whatever tsconfig.json grows later.
typecheck:
    npx tsc --noEmit

validate:
    claude plugin validate plugin --strict

check: install test typecheck validate
