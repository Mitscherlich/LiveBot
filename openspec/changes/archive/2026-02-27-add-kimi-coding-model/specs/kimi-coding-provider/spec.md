## ADDED Requirements

### Requirement: Kimi Coding provider preset exists
The system SHALL provide a `kimi-coding` provider option in the LLM Provider dropdown.

#### Scenario: User selects Kimi Coding provider
- **WHEN** user opens the LLM Provider dropdown in Settings
- **THEN** the dropdown SHALL contain an option labeled "Kimi Coding (编程专用)"
- **AND** the option value SHALL be `kimi-coding`

### Requirement: Kimi Coding preset auto-fills configuration
The system SHALL automatically fill base_url and model when Kimi Coding is selected.

#### Scenario: Auto-fill on provider selection
- **WHEN** user selects `kimi-coding` from the Provider dropdown
- **THEN** the Base URL field SHALL be set to `https://api.kimi.com/coding`
- **AND** the Model field SHALL be set to `kimi-for-coding`

#### Scenario: Preserve manual override
- **GIVEN** user has selected `kimi-coding` provider
- **WHEN** user manually modifies the Model field
- **THEN** the custom model name SHALL be preserved on save

### Requirement: Kimi Coding uses Anthropic message format
The system SHALL route `kimi-coding` provider to AnthropicLLMPipeline for processing.

#### Scenario: Backend routes to correct pipeline
- **GIVEN** LLM config has provider set to `kimi-coding`
- **WHEN** the system creates an LLM pipeline
- **THEN** it SHALL instantiate AnthropicLLMPipeline
- **AND** the request SHALL use Anthropic Message format

### Requirement: Backward compatibility maintained
The system SHALL continue to support custom provider configuration for Kimi Coding.

#### Scenario: Existing custom config continues to work
- **GIVEN** an existing config with provider=`custom`, base_url=`https://api.kimi.com/coding`
- **WHEN** the system loads and uses this config
- **THEN** it SHALL function identically to before this change
