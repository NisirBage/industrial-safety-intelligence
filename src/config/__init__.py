"""Settings object and logging configuration.

Exists so every other layer reads configuration through one place
(``settings.get_settings()``) instead of touching ``os.environ`` ad
hoc. Depended on by api/main.py from M0 onward, and by every future
milestone that needs a config value (DB DSN, JWT secret, API keys).
"""
