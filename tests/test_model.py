"""Tests for gvp.model."""

from gvp.model import Element, Document, Catalog


class TestElement:
    def test_str_format(self):
        doc = Document(
            name="personal", filename="personal.yaml",
            path="/fake/personal.yaml", inherits=None,
            scope_label="personal", id_prefix=None,
            defaults={}, elements=[],
        )
        elem = Element(
            id="P3", category="principle", name="One Contiguous Block",
            status="active", tags=["maintainability"],
            maps_to=["personal:V2"], origin=[], updated_by={},
            fields={"statement": "Related logic lives together."},
            document=doc,
        )
        assert str(elem) == "personal:P3"

    def test_repr_format(self):
        doc = Document(
            name="personal", filename="personal.yaml",
            path="/fake/personal.yaml", inherits=None,
            scope_label="personal", id_prefix=None,
            defaults={}, elements=[],
        )
        elem = Element(
            id="P3", category="principle", name="One Contiguous Block",
            status="active", tags=["maintainability"],
            maps_to=["personal:V2"], origin=[], updated_by={},
            fields={"statement": "Related logic lives together."},
            document=doc,
        )
        assert repr(elem) == "personal.yaml:personal:P3"

    def test_status_defaults_to_active(self):
        doc = Document(
            name="test", filename="test.yaml",
            path="/fake/test.yaml", inherits=None,
            scope_label=None, id_prefix=None,
            defaults={}, elements=[],
        )
        elem = Element(
            id="V1", category="value", name="Test",
            tags=[], maps_to=[], origin=[], updated_by={},
            fields={}, document=doc,
        )
        assert elem.status == "active"


class TestElementReviewedBy:
    def test_reviewed_by_defaults_to_empty(self):
        doc = Document(
            name="test", filename="test.yaml",
            path="/fake/test.yaml", inherits=None,
            scope_label="test", id_prefix=None,
            defaults={}, elements=[],
        )
        elem = Element(
            id="P1", category="principle", name="Test",
            tags=[], maps_to=[], origin=[], updated_by={},
            fields={"statement": "Test."},
            document=doc,
        )
        assert elem.reviewed_by == []

    def test_reviewed_by_stores_entries(self):
        doc = Document(
            name="test", filename="test.yaml",
            path="/fake/test.yaml", inherits=None,
            scope_label="test", id_prefix=None,
            defaults={}, elements=[],
        )
        entry = {"date": "2026-02-22", "by": "guy", "note": "Looks good"}
        elem = Element(
            id="P1", category="principle", name="Test",
            tags=[], maps_to=[], origin=[], updated_by={},
            fields={"statement": "Test."},
            document=doc, reviewed_by=[entry],
        )
        assert len(elem.reviewed_by) == 1
        assert elem.reviewed_by[0]["by"] == "guy"


class TestDocument:
    def test_basic_creation(self):
        doc = Document(
            name="personal", filename="personal.yaml",
            path="/fake/personal.yaml", inherits="universal",
            scope_label="personal", id_prefix=None,
            defaults={"origin": {"project": "test"}},
            elements=[],
        )
        assert doc.name == "personal"
        assert doc.inherits == "universal"
        assert doc.defaults["origin"]["project"] == "test"


class TestCatalog:
    def test_empty_catalog(self):
        cat = Catalog()
        assert cat.documents == {}
        assert cat.elements == {}
        assert cat.tags == {}

    def test_add_document_indexes_elements(self):
        doc = Document(
            name="test", filename="test.yaml",
            path="/fake/test.yaml", inherits=None,
            scope_label=None, id_prefix=None,
            defaults={}, elements=[],
        )
        elem = Element(
            id="V1", category="value", name="Test",
            tags=[], maps_to=[], origin=[], updated_by={},
            fields={}, document=doc,
        )
        doc.elements.append(elem)
        cat = Catalog()
        cat.add_document(doc)
        assert "test" in cat.documents
        assert "test:V1" in cat.elements
        assert cat.elements["test:V1"] is elem

    def test_resolve_chain(self):
        root = Document(
            name="universal", filename="universal.yaml",
            path="/fake/universal.yaml", inherits=None,
            scope_label="universal", id_prefix="U",
            defaults={}, elements=[],
        )
        child = Document(
            name="personal", filename="personal.yaml",
            path="/fake/personal.yaml", inherits="universal",
            scope_label="personal", id_prefix=None,
            defaults={}, elements=[],
        )
        cat = Catalog()
        cat.add_document(root)
        cat.add_document(child)
        chain = cat.resolve_chain(child)
        assert [d.name for d in chain] == ["personal", "universal"]

    def test_ancestors(self):
        doc = Document(
            name="test", filename="test.yaml",
            path="/fake/test.yaml", inherits=None,
            scope_label=None, id_prefix=None,
            defaults={}, elements=[],
        )
        v1 = Element(
            id="V1", category="value", name="V",
            tags=[], maps_to=[], origin=[], updated_by={},
            fields={}, document=doc,
        )
        p1 = Element(
            id="P1", category="principle", name="P",
            tags=[], maps_to=["test:V1"], origin=[], updated_by={},
            fields={}, document=doc,
        )
        h1 = Element(
            id="H1", category="heuristic", name="H",
            tags=[], maps_to=["test:P1"], origin=[], updated_by={},
            fields={}, document=doc,
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
            name="test", filename="test.yaml",
            path="/fake/test.yaml", inherits=None,
            scope_label=None, id_prefix=None,
            defaults={}, elements=[],
        )
        v1 = Element(
            id="V1", category="value", name="V",
            tags=[], maps_to=[], origin=[], updated_by={},
            fields={}, document=doc,
        )
        p1 = Element(
            id="P1", category="principle", name="P",
            tags=[], maps_to=["test:V1"], origin=[], updated_by={},
            fields={}, document=doc,
        )
        doc.elements.extend([v1, p1])
        cat = Catalog()
        cat.add_document(doc)
        descendants = cat.descendants(v1)
        assert p1 in descendants
        assert v1 not in descendants
