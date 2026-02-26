"""Core data model: Element, Document, Catalog."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from gvp.schema import ElementCategoryRegistry

from gvp.schema import BaseElement as Element  # noqa: E402


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
        self.element_category_registry: ElementCategoryRegistry | None = None
        self.load_warnings: list[str] = []

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
