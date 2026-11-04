import { useState, type FormEvent } from 'react';
import { addRoll } from './rollHistory';
import {
  dieSizes,
  expression,
  rollDice,
  type DieSize,
  type RollResult,
} from './rollDice';

export default function DiceRoller({ onClose }: { onClose: () => void }) {
  const [die, setDie] = useState<DieSize>(20);
  const [count, setCount] = useState('1');
  const [modifier, setModifier] = useState('0');
  const [history, setHistory] = useState<RollResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const countValue = Number(count);
  const modifierValue = Number(modifier);
  const validCount =
    count.trim() !== '' &&
    Number.isInteger(countValue) &&
    countValue >= 1 &&
    countValue <= 20;
  const validModifier =
    modifier.trim() !== '' &&
    Number.isInteger(modifierValue) &&
    modifierValue >= -100 &&
    modifierValue <= 100;
  const latest = history[0];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validCount) {
      setError('Choose between 1 and 20 dice.');
      return;
    }
    if (!validModifier) {
      setError('Enter a whole-number modifier from -100 to 100.');
      return;
    }
    try {
      const result = rollDice(die, countValue, modifierValue);
      setHistory((current) => addRoll(current, result));
      setError(null);
    } catch {
      setError('Dice could not be rolled. Try again.');
    }
  }

  return (
    <div className="dice-content">
      <div className="dice-header">
        <div>
          <p className="page-context">Gameplay tool</p>
          <h2 id="dice-title">Dice roller</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dice roller"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <form onSubmit={submit} className="dice-form" noValidate>
        <fieldset className="dice-fieldset">
          <legend>Die type</legend>
          <div className="dice-options">
            {dieSizes.map((size) => (
              <button
                type="button"
                className={`die-option ${die === size ? 'die-option-active' : ''}`}
                aria-pressed={die === size}
                onClick={() => setDie(size)}
                key={size}
              >
                d{size}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="dice-fields">
          <label>
            Number of dice
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="20"
              step="1"
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
          </label>
          <label>
            Modifier
            <input
              type="number"
              inputMode="numeric"
              min="-100"
              max="100"
              step="1"
              value={modifier}
              onChange={(event) => setModifier(event.target.value)}
            />
          </label>
        </div>
        <p className="dice-expression">
          Expression:{' '}
          <strong>
            {validCount && validModifier
              ? expression(countValue, die, modifierValue)
              : 'Enter valid dice and modifier values'}
          </strong>
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button button-primary dice-roll-button"
          type="submit"
        >
          Roll dice
        </button>
      </form>
      {latest ? (
        <section
          className="dice-result-preview"
          aria-label="Latest roll"
          aria-live="polite"
        >
          <span>Latest roll · {latest.expression}</span>
          <strong>{latest.total}</strong>
          <p>Dice: {latest.results.join(', ')}</p>
          <p>
            Modifier: {latest.modifier >= 0 ? '+' : ''}
            {latest.modifier}
          </p>
        </section>
      ) : (
        <p className="dice-empty">
          Choose your dice and roll to see the result.
        </p>
      )}
      <section className="dice-history" aria-labelledby="dice-history-heading">
        <h3 id="dice-history-heading">Recent rolls</h3>
        {history.length ? (
          <ol>
            {history.map((roll, index) => (
              <li key={`${roll.rolledAt}-${index}`}>
                <div>
                  <strong>{roll.expression}</strong>
                  <span>{roll.total}</span>
                </div>
                <small>
                  Dice: {roll.results.join(', ')} · Modifier:{' '}
                  {roll.modifier >= 0 ? '+' : ''}
                  {roll.modifier}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p>No rolls yet in this session.</p>
        )}
      </section>
    </div>
  );
}
