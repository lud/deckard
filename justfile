install:
    npm install

test:
    node --test

validate:
    claude plugin validate . --strict

check: install test validate
