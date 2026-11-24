# Importing & exporting quizzes

## Pinpop JSON

Export any quiz with _Export → JSON_. The file looks like:

```json
{
  "pinpop": 1,
  "quiz": {
    "title": "World capitals",
    "description": "",
    "language": "en",
    "visibility": "private",
    "tags": ["geography"],
    "questions": [
      {
        "type": "quiz",
        "text": "Capital of Türkiye?",
        "timeLimit": 20,
        "choices": [{ "text": "Ankara", "correct": true }, { "text": "İstanbul" }]
      }
    ]
  }
}
```

The full schema lives in [`backend/src/pinpop/domain/quiz.py`](../backend/src/pinpop/domain/quiz.py). Ids are optional on import.

## Spreadsheet (CSV / Excel)

Save your sheet as CSV (UTF-8). One question per row, with these columns:

| Column                | Meaning                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                | `quiz` (default), `multi`, `truefalse`, `type`, `slider`, `order`, `poll`, `wordcloud`                                                               |
| `question`            | Question text                                                                                                                                        |
| `answer1` … `answer6` | Choices / items. For `slider`: `answer1` = min, `answer2` = max. For `order`: items in the correct order                                             |
| `correct`             | Number(s) of the correct answers: `2` or `1,3`. `true`/`false` for truefalse. Accepted answers separated by `\|` for `type`. The number for `slider` |
| `time`                | Seconds (default 20)                                                                                                                                 |
| `explanation`         | Optional explanation                                                                                                                                 |

Example:

```csv
type,question,answer1,answer2,answer3,answer4,answer5,answer6,correct,time,explanation
quiz,Capital of Türkiye?,İstanbul,Ankara,İzmir,Bursa,,,2,20,Ankara has been the capital since 1923.
truefalse,The Moon is a planet,,,,,,,false,10,
```
