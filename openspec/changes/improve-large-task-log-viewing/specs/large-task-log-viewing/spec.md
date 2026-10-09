## ADDED Requirements

### Requirement: Bounded initial task-log view
The task-log UI SHALL load a bounded latest page by default instead of loading the complete task log into browser application state.

#### Scenario: User opens a large task log
- **WHEN** a user opens a task-instance log that exceeds one page
- **THEN** the UI displays the latest bounded page and indicates that earlier entries are available

### Requirement: Navigation across loaded log pages
The task-log UI SHALL let users load available older pages and return to newer pages without replacing the selected task attempt.

#### Scenario: User loads older output
- **WHEN** the user selects the control to load an available older log page
- **THEN** the UI retrieves and displays that page while preserving the currently selected task attempt

### Requirement: Bounded live tail window
The task-log UI SHALL poll a running or deferred task log using its newest continuation cursor and SHALL retain only a bounded client-side window of log entries.

#### Scenario: Running task emits logs beyond the client window
- **WHEN** continued live output causes the retained window to exceed its configured bound
- **THEN** the UI discards the oldest retained entries, keeps the newest output visible, and indicates that older in-memory entries were discarded

### Requirement: Virtualized log rendering
The task-log UI SHALL render only the visible and overscanned log rows rather than mounting every loaded log entry in the DOM.

#### Scenario: User scrolls a page with many entries
- **WHEN** a user scrolls through a loaded large log page
- **THEN** the UI maintains formatted structured-log rendering while limiting mounted log rows to the viewport and overscan range

### Requirement: Loaded-data filter scope
The task-log UI SHALL apply existing log-level and source filters to loaded log entries and SHALL identify that those filters do not search unloaded pages.

#### Scenario: User filters a paged log
- **WHEN** a user applies a log-level or source filter while older pages remain unloaded
- **THEN** the UI filters the loaded entries and communicates that unloaded content is not included in the filter result

### Requirement: Streaming full-log download
The task-log UI SHALL initiate a full-log download through a download-oriented response without building the complete log text or Blob in browser application state.

#### Scenario: User downloads a large log
- **WHEN** a user requests download for a large task log
- **THEN** the browser receives an attachment response while the UI does not retain the full log content solely to construct the download
