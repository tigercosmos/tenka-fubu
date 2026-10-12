# New-game wizard: final native evidence

The four-step new-game wizard passed all 16 focused native cases at commit `b6aca268afce05e99ae2a2f76538aa9e660bf344`. Fifteen cases cover every supported interface scale from 0.8 to 1.5 at 1280 × 720. The last case compares the exported game state after two starts with the same scenario, clan, difficulty, and seed. The Playwright report records 16 expected results, zero unexpected results, and a duration of 62,486.239 ms.

The wizard shows scenario, clan, difficulty, and seed steps. It keeps choices during back navigation, rejects invalid seed text, accepts the full unsigned 32-bit seed range, and starts a paused game. The native cases use real controls and preserve the original 60-second case and 300-second global limits. The capture runner used one worker for this focused run.

## Source and execution

The sim4 runtime used the exact scoped Git source at `b6aca268afce05e99ae2a2f76538aa9e660bf344`. The [source manifest](source/manifest.json) lists 1,641 allowlisted source and build inputs. The 516-to-b6 archive contains only the wizard test and three wizard CSS files. Source verification reported zero mismatches before the native run and after it. The dependency and lockfile hashes also matched before and after the run. The build passed before the native run. The post-run process observation found no owned Playwright, preview, or Chromium processes.

The complete native run is `/tmp/tenka-m8-b6-native-01` on sim4. Its browser output remains at `/tmp/tenka-m8-b6-native-01/browser-results` (18 MB, 166 files). [The SHA-256 inventory](native/remote-browser-results.sha256) lists every retained file. This package contains the 0.8, 1.0, and 1.5 screenshot and geometry files under [images](images/). The six selected screenshots reviewed by the root team passed visual review; the native geometry and text checks cover all 15 scales.

## Observed sequence

| Source or control                                     |   Native result | What the run established                                                                                                    |
| ----------------------------------------------------- | --------------: | --------------------------------------------------------------------------------------------------------------------------- |
| Original f03-era UI control                           |             0/1 | The clan screen showed a final Start button and lacked `daimyo-next`. This source control did not claim a full da142d1 pin. |
| `ab06242a` initial three cases                        |             2/3 | A 0.6875 px viewport overflow at scale 1.5 exposed a Playwright scroll-alignment gap.                                       |
| `ab06242a` explicit scroll and extended geometry      |        3/3 each | Real `scrollIntoView({ block: 'end' })` kept the original viewport bounds and assertions.                                   |
| `01c7dbc3` first 16 cases                             |            1/16 | Two cases found progress text below 12 px. Thirteen later cases failed an incorrect test expectation of 55 clans.           |
| `01c7dbc3` with the old roster CSS only               |             0/1 | The corrected 41-clan Range oracle caught Oda text past the card bottom at scale 1.5.                                       |
| `0a8e7479` corrected catalog case                     |           13/16 | Progress and clan text stayed below 12 px at the three smallest scales.                                                     |
| `51632426` four explicit font clamps                  |           14/16 | Two cases measured the scenario button container at 11.2/11.9 px although its four visible child spans used at least 12 px. |
| `51632426` read-only 0.8 font audit                   | 1/1 observation | Visible Back, Next, Start, seed hint/error, difficulty labels, and selected clan data used 11.2 px.                         |
| `b6aca268` screen font floor and semantic text oracle |           16/16 | Every supported scale passed the same real wizard flow and 32 px control checks.                                            |

The 55-clan claim was an error in the first test oracle. The scenario catalog contains 41 clans. The corrected test compares the ordered card IDs with the catalog and checks actual text Range rectangles. The earlier claim that inherited wizard text was 12.8 px at scale 0.8 was also wrong. The read-only browser audit measured 11.2 px. The final CSS applies `max(12px, var(--font-size-sm))` to the three wizard screen roots; it leaves the normal 14 px size intact. The scenario card test measures its four visible child spans while it keeps the card's viewport and 32 px control checks.

## Evidence files

- [Native raw captures](native/native-raw.tar.gz) contain the full stdout/stderr, command, process, result, and JSON report files for the ten runs in the table. Browser output stays on sim4.
- [Font audit JSON](native/font-audit-516.json) contains each visible text node, its computed font size, and its text Range rectangles at scale 0.8.
- [Local check captures](local-checks/captures.tar.gz) contain the source archive commands, transfer/setup logs, source and dependency checks, focused checks, font audit producer, and coordinator validation captures.
- [Source archive](source/source.tar) and [source manifest](source/manifest.json) identify the four changed files and all 1,641 scoped inputs.
- [SHA-256 inventory](native/remote-browser-results.sha256) identifies the complete remote browser output. [The verifier](verify.py) checks the package hashes, source archive, reports, font audit, and selected screenshot hashes.

The native result does not close the remaining M8-17 selected-clan map and recommendation requirement. The current clan screen shows source-backed metadata, but it has no authoritative static ownership map or recommendation data. This package does not claim a full Playwright suite, a balance decision, or human approval for the remaining art gates.
