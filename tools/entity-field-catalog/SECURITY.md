# Security Notes

## Known Issues

### xlsx Library Vulnerabilities

The xlsx library (v0.18.5) has two known vulnerabilities:
- GHSA-4r6h-8v6p-xvw6: Prototype Pollution in sheetJS
- GHSA-5pgg-2g8v-p4x9: SheetJS Regular Expression Denial of Service (ReDoS)

**Risk Assessment: LOW**

These vulnerabilities are related to parsing untrusted Excel files. In this tool, xlsx is used exclusively for:
- **Writing/Exporting data** to Excel format (XLSX.utils.json_to_sheet, XLSX.writeFile)
- **Not parsing user-uploaded files**

The tool generates Excel files from Dataverse metadata that is fetched from authenticated Dataverse environments. No user-provided Excel files are parsed, making the tool safe from these vulnerabilities.

**Mitigation:**
- The tool only exports data - it never imports or parses Excel files
- All data comes from trusted Dataverse API responses
- No user file upload functionality exists

## Security Features Implemented

1. **OData Query Escaping**: All user-provided input used in OData queries is properly escaped using single-quote doubling to prevent injection attacks
2. **Type Guards**: All accesses to `window.toolboxAPI` use optional chaining (?.) to prevent runtime errors
3. **Safe Type Conversion**: CSV export safely handles null/undefined values by converting to strings before processing
4. **No Direct SQL**: All data access goes through Dataverse Web API with proper authentication
