# Security Notes

## Dependencies

### ExcelJS Library

The tool uses ExcelJS (v4.4.0) for Excel export functionality. This is an actively maintained library with:
- ✅ No known security vulnerabilities
- ✅ Regular updates and maintenance
- ✅ Pure JavaScript implementation
- ✅ Safe for client-side usage

**Previous Version:** The tool initially used the xlsx library which had known vulnerabilities. These have been resolved by migrating to ExcelJS.

## Security Features Implemented

1. **OData Query Escaping**: All user-provided input used in OData queries is properly escaped using single-quote doubling to prevent injection attacks
2. **Type Guards**: All accesses to `window.toolboxAPI` use optional chaining (?.) to prevent runtime errors
3. **Safe Type Conversion**: CSV export safely handles null/undefined values by converting to strings before processing
4. **No Direct SQL**: All data access goes through Dataverse Web API with proper authentication
5. **Safe Excel Generation**: ExcelJS is used for Excel export with no parsing of untrusted input
