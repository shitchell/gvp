"""Tests for gvp.model."""

import pytest

from gvp.model import Element, Document, Catalog


class TestElement:
    def test_str_format(self):
        doc = Document(
            name="personal",
            filename="personal.yaml",
            path="/fake/personal.yaml",
            inherits=[],
            scope_label="personal",
            id_prefix=None,
            defaults={},
            elements=[],
        )
        elem = Element(
            id="P3",
            category="principle",
            name="One Contiguous Block",
            status="active",
            tags=["maintainability"],
            maps_to=["personal:V2"],
            origin=[],
            updated_by=[],
            statement="Related logic lives together.",
            document=doc,
        )
        assert str(elem) == "personal:P3"

    def test_repr_format(self):
        doc = Document(
            name="personal",
            filename="personal.yaml",
            path="/fake/personal.yaml",
            inherits=[],
            scope_label="personal",
            id_prefix=None,
            defaults={},
            elements=[],
        )
        elem = Element(
            id="P3",
            category="principle",
            name="One Contiguous Block",
            status="active",
            tags=["maintainability"],
            maps_to=["personal:V2"],
            origin=[],
            updated_by=[],
            statement="Related logic lives together.",
            document=doc,
        )
        assert repr(elem) == "personal.yaml:personal:P3"

    def test_status_defaults_to_active(self):
        doc = Document(
            name="test",
            filename="test.yaml",
            path="/fake/test.yaml",
            inherits=[],
            scope_label=None,
            id_prefix=None,
            defaults={},
            elements=[],
        )
        elem = Element(
            id="V1",
            category="value",
            name="Test",
            tags=[],
            maps_to=[],
            origin=[],
            updated_by=[],
            document=doc,
        )
        assert elem.status == "active"


class TestElementReviewedBy:
    def test_reviewed_by_defaults_to_empty(self):
        doc = Document(
            name="test",
            filename="test.yaml",
            path="/fake/test.yaml",
            inherits=[],
            scope_label="test",
            id_prefix=None,
            defaults={},
            elements=[],
        )
        elem = Element(
            id="P1",
            category="principle",
            name="Test",
            tags=[],
            maps_to=[],
            origin=[],
            updated_by=[],
            statement="Test.",
            document=doc,
        )
        assert elem.reviewed_by == []

    def test_reviewed_by_stores_entries(self):
        doc = Document(
            name="test",
            filename="test.yaml",
            path="/fake/test.yaml",
            inherits=[],
            scope_label="test",
            id_prefix=None,
            defaults={},
            elements=[],
        )
        entry = {"date": "2026-02-22", "by": "guy", "note": "Looks good"}
        elem = Element(
            id="P1",
            category="principle",
            name="Test",
            tags=[],
            maps_to=[],
            origin=[],
            updated_by=[],
            statement="Test.",
            document=doc,
            reviewed_by=[entry],
        )
        assert len(elem.reviewed_by) == 1
        assert elem.reviewed_by[0]["by"] == "guy"


class TestDocument:
    def test_basic_creation(self):
        doc = Document(
            name="personal",
            filename="personal.yaml",
            path="/fake/personal.yaml",
            inherits=["universal"],
            scope_label="personal",
            id_prefix=None,
            defaults={"origin": {"project": "test"}},
            elements=[],
        )
        assert doc.name == "personal"
        assert doc.inherits == ["universal"]
        assert doc.defaults["origin"]["project"] == "test"


class TestCatalog:
    def test_empty_catalog(self):
        cat = Catalog()
        assert cat.documents == {}
        assert cat.elements == {}
        assert cat.tags == {}

    def test_add_document_indexes_elements(self):
        doc = Document(
            name="test",
            filename="test.yaml",
            path="/fake/test.yaml",
            inherits=[],
            scope_label=None,
            id_prefix=None,
            defaults={},
            elements=[],
        )
        elem = Element(
            id="V1",
            category="value",
            name="Test",
            tags=[],
            maps_to=[],
            origin=[],
            updated_by=[],
            document=doc,
        )
        doc.elements.append(elem)
        cat = Catalog()
        cat.add_document(doc)
        assert "test" in cat.documents
        assert "test:V1" in cat.elements
        assert cat.elements["test:V1"] is elem

    def test_resolve_ancestors_single_parent(self):
        root = Document(
            name="universal",
            filename="universal.yaml",
            path="/fake/universal.yaml",
            inherits=[],
            scope_label="universal",
            id_prefix="U",
            defaults={},
            elements=[],
        )
        child = Document(
            name="personal",
            filename="personal.yaml",
            path="/fake/personal.yaml",
            inherits=["universal"],
            scope_label="personal",
            id_prefix=None,
            defaults={},
            elements=[],
        )
        cat = Catalog()
        cat.add_document(root)
        cat.add_document(child)
        ancestors = cat.resolve_ancestors(child)
        assert [d.name for d in ancestors] == ["universal"]

    def test_resolve_ancestors_multiple_parents(self):
        root = Document(
            name="org",
            filename="org.yaml",
            path="/fake/org.yaml",
            inherits=[],
            scope_label="org",
            id_prefix=None,
            defaults={},
            elements=[],
        )
        team = Document(
            name="team",
            filename="team.yaml",
            path="/fake/team.yaml",
            inherits=["org"],
            scope_label="team",
            id_prefix=None,
            defaults={},
            elements=[],
        )
        python = Document(
            name="python",
            filename="python.yaml",
            path="/fake/python.yaml",
            inherits=["org"],
            scope_label="python",
            id_prefix=None,
            defaults={},
            elements=[],
        )
        project = Document(
            name="project",
            filename="project.yaml",
            path="/fake/project.yaml",
            inherits=["team", "python"],
            scope_label="project",
            id_prefix=None,
            defaults={},
            elements=[],
        )
        cat = Catalog()
        for doc in [root, team, python, project]:
            cat.add_document(doc)
        ancestors = cat.resolve_ancestors(project)
        names = [d.name for d in ancestors]
        # BFS: team, python (declared order), then org (shared parent, visited once)
        assert names == ["team", "python", "org"]

    def test_resolve_ancestors_diamond(self):
        """Diamond: A inherits B and C, both inherit D. D appears once."""
        d = Document(
            name="d",
            filename="d.yaml",
            path="/fake/d.yaml",
            inherits=[],
            scope_label=None,
            id_prefix=None,
            defaults={},
            elements=[],
        )
        b = Document(
            name="b",
            filename="b.yaml",
            path="/fake/b.yaml",
            inherits=["d"],
            scope_label=None,
            id_prefix=None,
            defaults={},
            elements=[],
        )
        c = Document(
            name="c",
            filename="c.yaml",
            path="/fake/c.yaml",
            inherits=["d"],
            scope_label=None,
            id_prefix=None,
            defaults={},
            elements=[],
        )
        a = Document(
            name="a",
            filename="a.yaml",
            path="/fake/a.yaml",
            inherits=["b", "c"],
            scope_label=None,
            id_prefix=None,
            defaults={},
            elements=[],
        )
        cat = Catalog()
        for doc in [d, b, c, a]:
            cat.add_document(doc)
        ancestors = cat.resolve_ancestors(a)
        names = [d_doc.name for d_doc in ancestors]
        assert names == ["b", "c", "d"]

    def test_resolve_ancestors_cycle_raises(self):
        a = Document(
            name="a",
            filename="a.yaml",
            path="/fake/a.yaml",
            inherits=["b"],
            scope_label=None,
            id_prefix=None,
            defaults={},
            elements=[],
        )
        b = Document(
            name="b",
            filename="b.yaml",
            path="/fake/b.yaml",
            inherits=["a"],
            scope_label=None,
            id_prefix=None,
            defaults={},
            elements=[],
        )
        cat = Catalog()
        cat.add_document(a)
        cat.add_document(b)
        with pytest.raises(ValueError, match="Circular inheritance"):
            cat.resolve_ancestors(a)

    def test_ancestors(self):
        doc = Document(
            name="test",
            filename="test.yaml",
            path="/fake/test.yaml",
            inherits=[],
            scope_label=None,
            id_prefix=None,
            defaults={},
            elements=[],
        )
        v1 = Element(
            id="V1",
            category="value",
            name="V",
            tags=[],
            maps_to=[],
            origin=[],
            updated_by=[],
            document=doc,
        )
        p1 = Element(
            id="P1",
            category="principle",
            name="P",
            tags=[],
            maps_to=["test:V1"],
            origin=[],
            updated_by=[],
            document=doc,
        )
        h1 = Element(
            id="H1",
            category="heuristic",
            name="H",
            tags=[],
            maps_to=["test:P1"],
            origin=[],
            updated_by=[],
            document=doc,
        )
        doc.elements.extend([v1, p1, h1])
        cat = Catalog()
        cat.add_document(doc)
        ancestors = cat.ancestors(h1)
        assert v1 in ancestors
        assert p1 in ancestors
        assert h1 not in ancestors

    def test_descendants(self):
        doc = Document(
            name="test",
            filename="test.yaml",
            path="/fake/test.yaml",
            inherits=[],
            scope_label=None,
            id_prefix=None,
            defaults={},
            elements=[],
        )
        v1 = Element(
            id="V1",
            category="value",
            name="V",
            tags=[],
            maps_to=[],
            origin=[],
            updated_by=[],
            document=doc,
        )
        p1 = Element(
            id="P1",
            category="principle",
            name="P",
            tags=[],
            maps_to=["test:V1"],
            origin=[],
            updated_by=[],
            document=doc,
        )
        doc.elements.extend([v1, p1])
        cat = Catalog()
        cat.add_document(doc)
        descendants = cat.descendants(v1)
        assert p1 in descendants
        assert v1 not in descendants


class TestElementPriority:
    def test_priority_defaults_to_none(self):
        doc = Document(
            name="test", filename="test.yaml", path="/fake/test.yaml",
            inherits=[], scope_label=None, id_prefix=None, defaults={}, elements=[],
        )
        elem = Element(
            id="V1", category="value", name="Test", tags=[], maps_to=[],
            origin=[], updated_by=[], document=doc,
        )
        assert elem.priority is None

    def test_priority_stores_value(self):
        doc = Document(
            name="test", filename="test.yaml", path="/fake/test.yaml",
            inherits=[], scope_label=None, id_prefix=None, defaults={}, elements=[],
        )
        elem = Element(
            id="V1", category="value", name="Test", tags=[], maps_to=[],
            origin=[], updated_by=[], document=doc, priority=3,
        )
        assert elem.priority == 3

    def test_priority_stores_float(self):
        doc = Document(
            name="test", filename="test.yaml", path="/fake/test.yaml",
            inherits=[], scope_label=None, id_prefix=None, defaults={}, elements=[],
        )
        elem = Element(
            id="V1", category="value", name="Test", tags=[], maps_to=[],
            origin=[], updated_by=[], document=doc, priority=1.5,
        )
        assert elem.priority == 1.5
