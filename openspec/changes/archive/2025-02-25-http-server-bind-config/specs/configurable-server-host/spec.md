## ADDED Requirements

### Requirement: HTTP server binds to configurable address
The system SHALL allow configuring the HTTP server bind address through configuration.

#### Scenario: Default bind address
- **WHEN** the HTTP server starts without explicit configuration
- **THEN** the server SHALL bind to 127.0.0.1 (localhost only)

#### Scenario: Custom bind address
- **WHEN** the HTTP server starts with bind_address set to "0.0.0.0"
- **THEN** the server SHALL bind to 0.0.0.0 (all interfaces)

#### Scenario: Specific IP bind address
- **WHEN** the HTTP server starts with bind_address set to a specific IP (e.g., "192.168.1.100")
- **THEN** the server SHALL bind to that specific IP address

### Requirement: Configuration file storage
The system SHALL store server bind configuration in a persistent configuration file.

#### Scenario: Configuration file exists
- **WHEN** the application starts
- **THEN** the system SHALL read bind_address from the configuration file

#### Scenario: Configuration file missing
- **WHEN** the application starts without a configuration file
- **THEN** the system SHALL create a default configuration with bind_address set to 127.0.0.1

### Requirement: Bind address validation
The system SHALL validate the configured bind address before attempting to bind.

#### Scenario: Valid IP address
- **WHEN** the configured bind_address is a valid IP address (IPv4 or IPv6)
- **THEN** the server SHALL attempt to bind to that address

#### Scenario: Invalid IP address
- **WHEN** the configured bind_address is not a valid IP address
- **THEN** the system SHALL log an error and fall back to 127.0.0.1
