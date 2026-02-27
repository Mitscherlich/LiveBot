## ADDED Requirements

### Requirement: System settings page exists
The system SHALL provide a system settings page accessible from the main navigation.

#### Scenario: Access system settings
- **WHEN** user clicks "System" in the main navigation
- **THEN** the system settings page SHALL be displayed

### Requirement: Bind address configuration UI
The system settings page SHALL provide a form to configure the server bind address.

#### Scenario: Display current bind address
- **WHEN** user opens the system settings page
- **THEN** the current bind address SHALL be displayed in an input field

#### Scenario: Modify bind address
- **WHEN** user enters a new bind address and saves
- **THEN** the new bind address SHALL be persisted to the configuration file
- **AND** a message SHALL be displayed indicating a restart is required

#### Scenario: Validate bind address input
- **WHEN** user enters an invalid IP address format
- **THEN** the system SHALL display a validation error
- **AND** the save button SHALL be disabled

### Requirement: Display restart requirement
The system SHALL inform users that configuration changes require a service restart.

#### Scenario: After saving bind address
- **WHEN** user successfully saves a new bind address
- **THEN** a notification SHALL be displayed stating "Changes will take effect after service restart"

### Requirement: Provide default and common options
The system SHALL provide common bind address options for user convenience.

#### Scenario: Quick select options
- **WHEN** user opens the bind address configuration
- **THEN** radio buttons or dropdown SHALL be available for:
  - "Localhost only (127.0.0.1)" - default
  - "All interfaces (0.0.0.0)"
  - "Custom IP address"
