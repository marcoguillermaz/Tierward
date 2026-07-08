---
name: humanize
description: >
  Use ONLY when the user explicitly asks to humanize text, make writing sound more natural,
  remove AI tells, or reduce robotic tone. Do NOT activate for code generation, technical
  documentation, commit messages, SQL, JSON, API specs, or any task where the user has not
  explicitly requested humanization. Languages in scope: Italian and English.
user-invocable: true
model: sonnet
context: fork
allowed-tools: Read Glob Grep Edit
---

# Humanize

Rewrites text to remove AI-generated patterns and produce natural, human-quality prose.

## Input

The user provides text to humanize. They may also specify a domain:
- `email` — transactional or relational email
- `contratto` / `contract` — formal legal/contractual document
- `comunicazione` / `announcement` — editorial content for an audience
- `generico` / `generic` — default when no domain is specified

If no domain is stated, default to `generico`.

## Process

1. Read the full input text.
2. **If no AI patterns are detected** and the text already reads naturally for its register, return the original text unchanged. Do not force edits on already-human writing.
3. Identify all patterns from `@references/patterns-en.md` and `@references/patterns-it.md` present in the text.
4. Apply transformations below, calibrated to the detected language (IT / EN / mixed).
5. Respect domain register: `email` = conversational; `contratto` = formal but not robotic; `comunicazione` = editorial voice; `generico` = match the surrounding register of the input.
6. **For very short input (<50 words):** apply only HIGH severity vocabulary rules and obvious opener removal. Skip sentence rhythm and structural rules — insufficient text for structural variation.

## Transformation rules

### Sentence rhythm
- Break uniform sentence length. Vary between short (5-8 words) and long (20-30 words) sentences within the same paragraph.
- Add at least one sentence fragment or rhetorical one-liner per 4-5 paragraphs if appropriate to register.
- Dissolve the "topic sentence - evidence - conclusion" paragraph template wherever it appears mechanically.

### Vocabulary substitution
- Replace every word or phrase in the HIGH severity list in `@references/patterns-en.md` and `@references/patterns-it.md`.
- Replace MEDIUM severity items when they cluster (3+ in the same paragraph).
- LOW severity items: replace only if removing improves the sentence, otherwise leave.

### Structure
- Remove unsolicited "Challenges" sections. Integrate genuine limitations inline if they appear.
- Remove "In conclusion / In summary / Overall / In conclusione" openers on final paragraphs. End by saying something specific, not by repeating the beginning.
- Remove predictable five-part essay scaffolding. Preserve the content, not the scaffold.
- Convert mechanical bullet-point lists to prose when the items are short and connected.

### Voice
- Remove all hedging phrases from the HIGH severity list. If the underlying claim is uncertain, express uncertainty with specifics ("I don't have data on this" not "Research suggests...").
- Remove vague attribution ("experts say", "studies show", "si ritiene che"). If there is no source, remove the claim or rephrase as the author's observation.
- Remove balanced non-resolution ("on one hand... on the other...") when the question has a defensible answer. Take the position the evidence supports.
- Remove unearned enthusiasm ("fascinating", "groundbreaking", "pivotal") unless the specific context justifies it.

### Anti-hallucination
- Never invent facts, statistics, sources, or arguments to replace removed AI filler.
- If removing a vague attribution leaves a factual gap that cannot be filled from the input text alone, remove the entire claim rather than fabricating a replacement. Do not insert sources, names, or data not present in the original.
- Technical hedging is not AI filler: preserve genuinely conditional claims ("this may improve performance under load", "depending on configuration") — these reflect real uncertainty, not AI patterns.

### Italian-specific (apply when input is Italian)
- Remove explicit subject pronouns where Italian drops them naturally ("Edoardo poi..." not "Edoardo poi lui...").
- Replace Anglicized constructions that don't exist in natural Italian prose.
- Fix heading capitalization to Italian convention (first word only, not per-word title case).
- Add colons where Italian prose uses them naturally — they are frequently underused in AI-generated Italian.
- Use impersonal "si" constructions where appropriate instead of explicit passive or explicit subject.

### Punctuation
- Replace em dashes used as generic connectors. Use commas, colons, parentheses, or rewrite the sentence.
- Do not use ellipsis for pauses or trailing thoughts.
- Introduce contractions (don't, isn't, it's) in English informal registers. Italian: use natural elisions.

### Exclusions — never modify
- Code blocks (fenced ``` or indented)
- Inline code (`backtick-wrapped`)
- JSON, YAML, frontmatter
- Technical labels and field names
- Quoted text (content inside quotation marks that represents a verbatim quote)
- Proper nouns, brand names, product names

## Output

Return ONLY the rewritten text.
No explanations. No list of changes made. No commentary.
The output format (paragraphs, headers, lists) mirrors the structure of the input — do not reformat unless the input structure is itself an AI structural pattern being removed.
