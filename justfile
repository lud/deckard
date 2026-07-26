install:
    npm install

test:
    node --test

# Enforces the // @ts-check + JSDoc annotations the scripts already carry.
typecheck:
    npx tsc

validate:
    claude plugin validate plugin --strict

check: install test typecheck validate
