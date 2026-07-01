"""SimClock - the only notion of "now" the simulation layer uses.

Exists so no domain or service code ever calls a wall-clock API
(``datetime.now()``, ``datetime.utcnow()``, ``time.time()``) directly;
everything that needs a timestamp during simulation gets it from here
instead, which is what makes a scenario run byte-for-byte replayable
regardless of when or how fast it's actually executed. Enforced by
``tests/unit/test_no_wallclock_calls.py``, which walks the AST of
``src/domain`` and ``src/services`` for exactly those calls.

``src/domain/simulation/generator.py`` depends on this to compute
reading/permit timestamps; ``src/services/simulation_runner.py``
doesn't touch it directly - it only calls into ``generator.py``.
"""

from datetime import datetime, timedelta


class SimClock:
    def __init__(self, start_time: datetime) -> None:
        self._start_time = start_time
        self._current = start_time

    def now(self) -> datetime:
        return self._current

    def advance(self, minutes: float) -> None:
        self._current += timedelta(minutes=minutes)

    def reset(self) -> None:
        """Return to the original start time.

        Lets one SimClock instance be reused across independent
        scenario events (each event starts counting from its own
        ``sim_time`` offset) and gives tests a clean way to set up
        deterministic state without constructing a fresh clock.
        """
        self._current = self._start_time
