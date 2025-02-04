/** @type {import('prettier').Config} */
const config = {
    plugins: ['@ianvs/prettier-plugin-sort-imports'],
    trailingComma: 'all',
    singleQuote: true,
    printWidth: 80,
    tabWidth: 4,
    arrowParens: 'avoid',
    semi: false,

    // Sort imports at the top of files
    importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
    importOrderTypeScriptVersion: '5.0.0',
    importOrder: [
        '^(react/(.*)$)|^(react$)',
        '^(next/(.*)$)|^(next$)',
        '<THIRD_PARTY_MODULES>',
        '',
        '^@/lib/(.*)$',
        '^@/components/ui/(.*)$',
        '^@/components/.+/(.*)$',
        '^@/services/(.*)$',
        '^@/actions/(.*)$',
        '^@/hooks/(.*)$',
        '^@/store/(.*)$',
        '',
        '^[./]',
        '',
        '<TYPES>^(node:)',
        '<TYPES>',
        '<TYPES>^[.]',
    ],
}

export default config
