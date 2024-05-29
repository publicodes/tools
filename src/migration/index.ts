/** @packageDocumentation

## Migrate a situation

{@link migrateSituation | `migrateSituation`} allows to migrate situation and foldedSteps based on migration instructions. It's useful in forms when a model is updated and we want old answers to be kept and taken into account in the new model.

### Usage

For instance, we have a simple set of rules:

```yaml
age:
    question: "Quel est votre âge ?"
````

and the following situation:
```json
{
    age: 25
}
```

If I change my model because I want to fix the accent to:

```yaml
âge:
    question: "Quel est votre âge ?"
```

I don't want to lose the previous answer, so I can use `migrateSituation` with the following migration instructions:

```yaml
keysToMigrate:
    age: âge
```

Then, calling `migrateSituation` with the situation and the migration instructions will return:

```json
{
    âge: 25
}
```
*/

export * from './migrateSituation'
