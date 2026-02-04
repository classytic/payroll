# Changelog

## [2.7.5] - 2026-01-25

### Fixed

- **Code Quality**: Replaced `console.error()` with proper logger in plugin error handler
- **Type Safety**: Added proper types to factory function parameters in `createSalaryProcessingManager`
  - Eliminated 6 `any` type parameters with proper function types from `context.ts`
  - Added comprehensive JSDoc with parameter descriptions and usage example
- **Error Handling**: Use `ValidationError` instead of generic `Error` in compensation manager
  - Consistent error types across the package
  - Better error handling for missing allowance/deduction types
- **Logging**: Added debug logging to error handler catch block in plugin system
  - Helps troubleshoot plugin configuration issues without infinite loops

### Improved

- **Documentation**: Enhanced JSDoc for `createSalaryProcessingManager` with full parameter descriptions
- **Developer Experience**: Better type inference and autocomplete in factory functions
- **Maintainability**: Reduced technical debt in core manager factories


## [2.6.0] - Previous Version
- App Previous version before 2.6 removed for stability
- Versions removed as had lot of feature dependencies
- Repository pattern with mongokit
- Multi-tenant security
- Service layer architecture


## [1.0.0] - Initial Version