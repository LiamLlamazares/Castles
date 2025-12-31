# Walkthrough - Phase Refactoring: "Recruitment"

I have successfully refactored the game phase structure to unify Castle and Sanctuary recruitment into a new "Recruitment" phase at the end of the turn.

## Changes

### 1. Phase Renaming
- **Before:** "Castles" Phase (Turn indices 4, 9, etc.)
- **After:** "Recruitment" Phase
- **Reason:** To encompass both Castle recruitment and Sanctuary Pledging under one thematic umbrella.

### 2. Logic Restrictions
- **Sanctuary Pledging**: Now STRICTLY limited to the **Recruitment Phase**. 
    - Previously: A "Free Action" usable at any time.
    - Now: User must wait until the end of the turn (Move -> Attack -> Recruit) to Pledge.
- **Phase Skipping**: Updated rules so the game does not auto-skip the Recruitment phase if you have a valid Sanctuary Pledge available, even if you have no Castles to recruit from.
    - **Fix Implemented**: The logic now correctly checks for *future* usability of sanctuaries (ignoring the current phase check during the lookahead) to prevent skipping the Recruitment phase prematurely.
- **Start Available Handling**: Updated `SanctuaryService` to respect the `startAvailable` configuration flag, allowing specific sanctuary types (like Wolf Covenant) to be pledged immediately regardless of the global unlock turn.

### 3. Verification Results

#### Unit Tests
- `GameEngine.test.ts`: Verified phase cycling returns "Recruitment" correctly.
- `Pledge.test.ts`: Verified `canPledge` returns `true` ONLY during the correct phase (simulated turnCounter=4/14 etc.), and `false` otherwise.

#### Manual Check
- A user playing the game will now see "Recruitment" in the banner.
- Users cannot "Pledge -> Move" anymore. They must "Move -> Attack -> Pledge". This aligns with the "Secure then Exploit" theme.
- **Sanctuary Recruitment**: Verified that players can now enter the Recruitment phase and pledge to a sanctuary even if they do not control any castles, provided the sanctuary is valid and available.

## Files Modified
- `src/Constants.ts`: Renamed type alias.
- `src/Classes/Core/TurnManager.ts`: Updated phase calculation logic.
- `src/Classes/Services/SanctuaryService.ts`: Added phase check validation and `startAvailable` support.
- `src/Classes/Systems/RuleEngine.ts`: Added check for usable sanctuaries to prevent phase skipping.
- `src/components/Turn_banner.tsx`: Updated UI label.
- `src/tutorial/lessons/m2_01_game_phases.ts`: Updated tutorial text.
