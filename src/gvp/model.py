"""Core data model: Element, Document, Catalog."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Element:
    """A single GVP element."""

    id: str
    category: str
    name: str
    tags: list[str]
    maps_to: list[str]
    origin: list[dict]
    updated_by: list[dict]
    fields: dict
    document: Document
    status: str = "active"
    reviewed_by: list[dict] = field(default_factory=list)
    priority: float | int | None = None

    def __str__(self) -> str:
        return f"{self.document.name}:{self.id}"

    def __repr__(self) -> str:
        return f"{self.document.filename}:{self.document.name}:{self.id}"

    def __hash__(self) -> int:
        return hash((self.document.name, self.id))

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Element):
            return NotImplemented
        return self.document.name == other.document.name and self.id == other.id


@dataclass
class Document:
    """A loaded GVP YAML file."""

    name: str
    filename: str
    path: str | Path
    inherits: list[str]
    scope_label: str | None
    id_prefix: str | None
    defaults: dict
    tag_definitions: dict[str, dict] = field(default_factory=dict)
    elements: list[Element] = field(default_factory=list)


class Catalog:
    """The resolved GVP graph across all documents and libraries."""

    def __init__(self) -> None:
        self.documents: dict[str, Document] = {}
        self.elements: dict[str, Element] = {}
        self.tags: dict[str, dict] = {}
        self.tag_sources: dict[str, str] = {}

    def add_document(self, doc: Document) -> None:
        self.documents[doc.name] = doc
        for elem in doc.elements:
            qualified = f"{doc.name}:{elem.id}"
            self.elements[qualified] = elem

    def resolve_ancestors(self, doc: Document) -> list[Document]:
        """BFS from doc's parents. Returns ancestors in breadth-first order.

        Raises ValueError if circular inheritance is detected.
        Missing parent documents (not loaded in catalog) are silently skipped;
        the validation layer enforces that all parents exist.
        """
        result: list[Document] = []
        visited: set[str] = {doc.name}
        queue = list(doc.inherits)
        while queue:
            name = queue.pop(0)
            if name == doc.name:
                if result:
                    path = " -> ".join(d.name for d in result) + f" -> {doc.name}"
                else:
                    path = f"{doc.name} (self-reference)"
                raise ValueError(f"Circular inheritance: {doc.name} -> {path}")
            if name in visited:
                continue
            parent = self.documents.get(name)
            if parent is None:
                continue
            visited.add(name)
            result.append(parent)
            queue.extend(parent.inherits)
        return result

    def ancestors(self, element: Element) -> set[Element]:
        result: set[Element] = set()
        queue = list(element.maps_to)
        while queue:
            qid = queue.pop(0)
            target = self.elements.get(qid)
            if target is None or target in result:
                continue
            result.add(target)
            queue.extend(target.maps_to)
        return result

    def descendants(self, element: Element) -> set[Element]:
        qualified = str(element)
        result: set[Element] = set()
        queue = [
            e for e in self.elements.values() if qualified in e.maps_to and e != element
        ]
        while queue:
            e = queue.pop(0)
            if e in result:
                continue
            result.add(e)
            e_qid = str(e)
            queue.extend(
                other
                for other in self.elements.values()
                if e_qid in other.maps_to and other not in result
            )
        return result
