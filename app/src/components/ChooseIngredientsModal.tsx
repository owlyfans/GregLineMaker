import { useState } from "react";
import type { Recipe, RecipeDatabase, RecipeIo } from "../types/recipe";
import { IconSlot } from "./IconSlot";
import { Modal } from "./Modal";

function resolveName(db: RecipeDatabase, kind: "item" | "fluid", id: string): string {
  return (kind === "fluid" ? db.fluids : db.items)[id] ?? id;
}

interface ChooseIngredientsModalProps {
  db: RecipeDatabase;
  recipe: Recipe;
  /** Inputs (excluding the target/primary one, already filtered to `ids.length > 1`) that accept
   * more than one concrete item/fluid - "any sugar", "any dye", etc. One picker is shown per slot. */
  ambiguousInputs: RecipeIo[];
  onConfirm: (choices: Map<RecipeIo, string>) => void;
  onClose: () => void;
}

/** Shown before expandWithRecipe/expandForward/applyRecipeToMachine actually run, whenever the
 * chosen recipe has an input slot that accepts several interchangeable ids (a tag-resolved "any
 * sugar" ingredient) - lets the user pick which concrete one gets added instead of always silently
 * defaulting to `ids[0]`. */
export function ChooseIngredientsModal({ db, recipe, ambiguousInputs, onConfirm, onClose }: ChooseIngredientsModalProps) {
  const [choices, setChoices] = useState<Map<RecipeIo, string>>(
    () => new Map(ambiguousInputs.map((io) => [io, io.ids[0]])),
  );

  return (
    <Modal title="Choose ingredients" onClose={onClose} width={480}>
      <p className="choose-ingredients-intro">
        This recipe ({recipe.id}) accepts more than one item for the slot{ambiguousInputs.length > 1 ? "s" : ""} below -
        pick which one to add.
      </p>
      <div className="choose-ingredients-groups">
        {ambiguousInputs.map((io, i) => (
          <div className="choose-ingredients-group" key={i}>
            <div className="choose-ingredients-group-label">
              {io.kind === "fluid" ? `${io.amount}mB` : `${io.amount}x`}
            </div>
            <div className="choose-ingredients-options">
              {io.ids.map((id) => {
                const label = resolveName(db, io.kind, id);
                const selected = choices.get(io) === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className="choose-ingredients-option"
                    onClick={() => setChoices((prev) => new Map(prev).set(io, id))}
                  >
                    <IconSlot
                      id={id}
                      label={label}
                      size={48}
                      className={selected ? "recipe-card-slot-highlight" : ""}
                      itemTooltip={{ kind: io.kind, resourceId: id }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onConfirm(choices)}>
          Add
        </button>
      </div>
    </Modal>
  );
}
