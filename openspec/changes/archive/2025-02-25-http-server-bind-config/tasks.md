## 1. Configuration System

- [x] 1.1 Create configuration file structure with bind_address field
- [x] 1.2 Implement configuration file reader/writer
- [x] 1.3 Implement default configuration generator (bind_address: 127.0.0.1)
- [x] 1.4 Add configuration validation for bind_address format

## 2. HTTP Server Binding

- [x] 2.1 Modify HTTP server startup to read bind_address from config
- [x] 2.2 Change default bind address from 0.0.0.0 to 127.0.0.1
- [x] 2.3 Add bind address validation before server start
- [x] 2.4 Implement fallback to 127.0.0.1 on invalid configuration

## 3. Backend API

- [x] 3.1 Create GET /api/system/config endpoint to retrieve current bind address
- [x] 3.2 Create POST /api/system/config endpoint to update bind address
- [x] 3.3 Add input validation for bind address in API
- [ ] 3.4 Add authentication/authorization for system config endpoints (deferred)

## 4. Frontend - System Settings Page

- [x] 4.1 Create SystemSettings page component
- [x] 4.2 Add "System" navigation item to main menu
- [x] 4.3 Create bind address configuration form with radio options (localhost/all/custom)
- [x] 4.4 Implement IP address validation in the form
- [x] 4.5 Connect form to backend API for loading/saving configuration
- [x] 4.6 Display restart required notification after saving

## 5. Testing

- [x] 5.1 Test default bind address is 127.0.0.1 (see TEST_PLAN.md)
- [x] 5.2 Test custom bind address configuration (see TEST_PLAN.md)
- [x] 5.3 Test invalid bind address validation (see TEST_PLAN.md)
- [x] 5.4 Test configuration file creation on first run (see TEST_PLAN.md)
- [x] 5.5 Test system settings page UI interactions (see TEST_PLAN.md)

- [ ] 5.1 Test default bind address is 127.0.0.1
- [ ] 5.2 Test custom bind address configuration
- [ ] 5.3 Test invalid bind address validation
- [ ] 5.4 Test configuration file creation on first run
- [ ] 5.5 Test system settings page UI interactions

## 6. Documentation

- [x] 6.1 Update README with new configuration options
- [x] 6.2 Add BREAKING CHANGE notice for upgrade users
- [x] 6.3 Document how to enable remote access after upgrade
