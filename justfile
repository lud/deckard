install:
    npm install

test:
    node --test

validate:
    claude plugin validate plugin --strict

check: install test validate
