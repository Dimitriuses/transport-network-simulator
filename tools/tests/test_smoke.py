"""P0M0 smoke test: the offline packages import and the toolchain runs."""

from analysis import PACKAGE_NAME as analysis_name
from validate import PACKAGE_NAME as validate_name
from worldbuild import PACKAGE_NAME as worldbuild_name


def test_offline_packages_import() -> None:
    assert worldbuild_name == "worldbuild"
    assert validate_name == "validate"
    assert analysis_name == "analysis"
