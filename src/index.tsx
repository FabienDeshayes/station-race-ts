import * as R from "ramda";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { connect, Provider } from "react-redux";
import { createStore } from "redux";
import "./index.css";

// Main types

type State = Begin | Setup | Turn | TurnResult | GameOver;

type Action =
  | SetupNewGame
  | Start
  | RegisterPlayer
  | GetOffTheTrain
  | GoLeft
  | GoRight
  | GoFirst
  | GoLast
  | NextTurn
  | PlayAgain
  | BeginAgain;

type StateTag = State["tag"];
type Transition<T extends State> = (state: T, input?: Action) => State;

// State guards

const stateIs = <T extends State>(tags: StateTag[]) => (
  state: State
): state is T => R.any(tag => state.tag === tag, tags);

const stateIsBegin = stateIs<Begin>(["Begin"]);
const stateIsSetup = stateIs<Setup>(["Setup"]);
const stateIsTurn = stateIs<Turn>(["Turn"]);
const stateIsAnyTurn = stateIs<Turn | TurnResult>(["Turn", "TurnResult"]);
const stateIsTurnResult = stateIs<TurnResult>(["TurnResult"]);
const stateIsGameOver = stateIs<GameOver>(["GameOver"]);

const stateIsNot = <T extends State>(tags: StateTag[]) => (
  state: State
): state is Exclude<State, T> => R.all(tag => tag !== state.tag, tags);

const stateIsNotGameOver = stateIsNot<GameOver>(["GameOver"]);

// States

interface Begin extends Configuration {
  tag: "Begin";
}

interface Setup extends Configuration {
  tag: "Setup";
}

interface Turn extends Configuration, Game {
  tag: "Turn";
}

interface TurnResult extends Configuration, Game {
  tag: "TurnResult";
}

interface GameOver extends Configuration {
  tag: "GameOver";
  winner: Player;
}

// Actions

// https://github.com/reduxjs/redux/issues/186
// this is usually not a problem in redux, because
// reducers just ignore actions they don't know
// how to handle, but because here we want to
// have exhaustive checks over all action types,
// we need to exit early if the action is
// an internal redux action.
// ... and known actions can only be known actions

type KnownAction = Action & {
  kind: "KnownAction";
};

interface SetupNewGame {
  type: "SetupNewGame";
}

interface RegisterPlayer {
  type: "RegisterPlayer";
  payload: PlayerRegistration;
}

interface Start {
  type: "Start";
}

interface GetOffTheTrain {
  type: "GetOffTheTrain";
}

interface NextTurn {
  type: "NextTurn";
}

interface GoLeft {
  type: "GoLeft";
}

interface GoRight {
  type: "GoRight";
}

interface GoFirst {
  type: "GoFirst";
}

interface GoLast {
  type: "GoLast";
}

interface PlayAgain {
  type: "PlayAgain";
}

interface BeginAgain {
  type: "BeginAgain";
}

// Other types

interface Configuration {
  firstStation: number;
  lastStation: number;
  minPlayers: number;
  maxPlayers: number;
  makeSecretStation: (configuration: Configuration) => number;
  registeredPlayers: { [key: number]: string };
}

interface Game {
  currentPlayer: number;
  players: Player[];
  secretStation: number;
}

interface Player {
  name: PlayerName;
  station: number;
}

interface PlayerRegistration {
  i: number;
  name: PlayerName;
}

type PlayerName = string;

// Transitions

const begin = (state: Configuration): Begin => ({
  ...state,
  tag: "Begin",

  registeredPlayers: {}
});

const setup = (state: Begin): Setup => ({
  ...state,
  tag: "Setup",

  registeredPlayers: R.range(0, state.maxPlayers).reduce(
    (reg, _, i) => ({
      ...reg,
      [i]: ""
    }),
    {}
  )
});

const start = (state: Setup): Setup | Turn =>
  hasEnoughPlayers(state) ? turn(state) : state;

const turn = (state: Setup): Turn => {
  return {
    ...state,
    tag: "Turn",

    currentPlayer: 0,
    players: R.values(state.registeredPlayers)
      .filter(Boolean)
      .map(name => ({
        name,
        station: state.firstStation
      })),
    secretStation: state.makeSecretStation(state)
  };
};

const getOffTheTrain = (state: Turn): GameOver | TurnResult =>
  hasWinner(state) ? gameOver(state) : turnResult(state);

const gameOver = (state: Turn): GameOver => ({
  ...configuration(state),
  tag: "GameOver",

  winner: winner(state)!
});

const turnResult = (state: Turn): TurnResult => ({
  ...state,
  tag: "TurnResult"
});

const nextTurn = (state: TurnResult): Turn => ({
  ...state,
  tag: "Turn",

  currentPlayer: nextPlayer(state as Game)
});

const playAgain = (state: GameOver): Turn =>
  turn({
    ...configuration(state),
    tag: "Setup"
  });

const startAgain = (state: GameOver): Begin => begin(configuration(state));

// Transition identities

const registerPlayer = (state: Setup, input: RegisterPlayer): Setup => {
  const { i, name } = input.payload;
  return {
    ...state,
    registeredPlayers: {
      ...state.registeredPlayers,
      [i]: isInvalidName(name) ? "" : name
    }
  };
};

const withCurrentPlayer = (fn: (state: Turn, player: Player) => Player) => (
  state: Turn
): Turn => ({
  ...state,
  players: state.players.map(
    (player, i) => (i === state.currentPlayer ? fn(state, player) : player)
  )
});

const goLeft = withCurrentPlayer((state, player) => ({
  ...player,
  station:
    player.station > state.firstStation ? player.station - 1 : state.lastStation
}));

const goRight = withCurrentPlayer((state, player) => ({
  ...player,
  station:
    player.station < state.lastStation ? player.station + 1 : state.firstStation
}));

const goFirst = withCurrentPlayer((state, player) => ({
  ...player,
  station: state.firstStation
}));

const goLast = withCurrentPlayer((state, player) => ({
  ...player,
  station: state.lastStation
}));

// Transition guards

export const transition = <T extends State>(
  fn: Transition<T>,
  state: State,
  input?: Action
): State => {
  switch (state.tag) {
    case "Begin":
      return stateIsBegin(state) ? fn(state as T) : state;
    case "Setup":
      return stateIsSetup(state) ? fn(state as T, input) : state;
    case "Turn":
      return stateIsTurn(state) ? fn(state as T, input) : state;
    case "TurnResult":
      return stateIsTurnResult(state) ? fn(state as T, input) : state;
    case "GameOver":
      return stateIsGameOver(state) ? fn(state as T, input) : state;
    default:
      return assertNever(state);
  }
};

// State machine

const reducer = (state: State, action: KnownAction): State => {
  // if the kind isn't KnownAction, it means something
  // is sending us dodgy actions in runtime
  if (action.kind !== "KnownAction") {
    return state;
  }

  switch (action.type) {
    case "SetupNewGame":
      return transition<Begin>(setup, state);
    case "RegisterPlayer":
      return transition<Setup>(registerPlayer, state, action);
    case "Start":
      return transition<Setup>(start, state);
    case "GoLeft":
      return transition<Turn>(goLeft, state);
    case "GoRight":
      return transition<Turn>(goRight, state);
    case "GoFirst":
      return transition<Turn>(goFirst, state);
    case "GoLast":
      return transition<Turn>(goLast, state);
    case "GetOffTheTrain":
      return transition<Turn>(getOffTheTrain, state);
    case "NextTurn":
      return transition<TurnResult>(nextTurn, state);
    case "PlayAgain":
      return transition<GameOver>(playAgain, state);
    case "BeginAgain":
      return transition<GameOver>(startAgain, state);
    default:
      return assertNever(action);
  }
};

function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

// Utils

const configuration: (state: State) => Configuration = R.pick([
  "firstStation",
  "lastStation",
  "minPlayers",
  "maxPlayers",
  "makeSecretStation",
  "registeredPlayers"
]);

const winner = (game: Game): Player | undefined =>
  game.players.find(player => player.station === game.secretStation);

const hasWinner = (game: Game): boolean => !!winner(game);

const hasEnoughPlayers = (config: Configuration): boolean =>
  R.values(config.registeredPlayers).filter(Boolean).length >=
  config.minPlayers;

const nextPlayer = (game: Game): number =>
  (game.currentPlayer + 1) % game.players.length;

const isInvalidName = (name: PlayerName) => /^\s*$/.test(name);

const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const makeSecretStation = ({ firstStation, lastStation }: Configuration) =>
  randInt(firstStation, lastStation);

const isCurrentPlayer = (game: Game, player: number): boolean =>
  game.currentPlayer === player;

const currentPlayer = (game: Game) => game.players[game.currentPlayer];

const stations = ({ firstStation, lastStation }: Configuration): number[] =>
  R.range(firstStation, lastStation + 1);

// UI

interface KeyboardProps {
  onLeft: () => void;
  onRight: () => void;
  onShiftLeft: () => void;
  onShiftRight: () => void;
  onEnter: () => void;
  onShiftEnter: () => void;
}

class Keyboard extends React.Component<KeyboardProps> {
  public static defaultProps: KeyboardProps = {
    onEnter: () => {},
    onLeft: () => {},
    onRight: () => {},
    onShiftEnter: () => {},
    onShiftLeft: () => {},
    onShiftRight: () => {}
  };

  constructor(props: KeyboardProps) {
    super(props);
    this.handleKeydown = this.handleKeydown.bind(this);
  }

  public handleKeydown(e: KeyboardEvent): void {
    const { shiftKey, key } = e;
    switch (shiftKey ? `Shift${key}` : key) {
      case "ArrowLeft":
        e.preventDefault();
        this.props.onLeft();
        break;
      case "ArrowRight":
        e.preventDefault();
        this.props.onRight();
        break;
      case "ShiftArrowLeft":
        e.preventDefault();
        this.props.onShiftLeft();
        break;
      case "ShiftArrowRight":
        e.preventDefault();
        this.props.onShiftRight();
        break;
      case "Enter":
        e.preventDefault();
        this.props.onEnter();
        break;
      case "ShiftEnter":
        e.preventDefault();
        this.props.onShiftEnter();
        break;
      default:
    }
  }

  public render() {
    return null;
  }

  public componentDidMount() {
    document.addEventListener("keydown", this.handleKeydown);
  }

  public componentWillUnmount() {
    document.removeEventListener("keydown", this.handleKeydown);
  }
}

function Header(state: State) {
  return (
    <React.Fragment>
      <h1>Station Race!</h1>

      {stateIsNotGameOver(state) && (
        <blockquote>
          Get off the train at the secret station to win the game.
        </blockquote>
      )}
    </React.Fragment>
  );
}

type PromptProps = Begin & { onSetupNewGame: () => void };

function Prompt(state: PromptProps) {
  const { onSetupNewGame } = state;
  return (
    <React.Fragment>
      <Keyboard onEnter={onSetupNewGame} />
      <ul>
        <li>
          You're in a train running from station {state.firstStation} to station{" "}
          {state.lastStation}.
        </li>
        <li>
          There is a secret station and you need to get off the train there.
        </li>
        <li>Be the first one to guess the secret station and win the game!</li>
      </ul>
      <div className="control-bar">
        <button
          className="control control-large"
          onClick={onSetupNewGame}
          tabIndex={-1}
        >
          BEGIN
        </button>
      </div>
      <ul className="small-print">
        <li>Enter: begin the game.</li>
      </ul>
    </React.Fragment>
  );
}

type GameSetupProps = Setup & {
  onStart: () => void;
  onRegisterPlayer: (player: PlayerRegistration) => void;
};

function GameSetup(state: GameSetupProps) {
  const { onStart, onRegisterPlayer } = state;
  const handleOnChange = (i: number) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    e.preventDefault();
    onRegisterPlayer({ i, name: e.target.value });
  };
  return (
    <React.Fragment>
      <Keyboard onEnter={onStart} />
      <ul>
        <li>Add at least {state.minPlayers} players to start the game.</li>
        <li>You can add up to {state.maxPlayers} players.</li>
      </ul>
      {R.range(0, state.maxPlayers).map((_, i) => (
        <div key={i} className="editor">
          <input
            value={state.registeredPlayers[i] ? state.registeredPlayers[i] : ""}
            onChange={handleOnChange(i)}
          />{" "}
        </div>
      ))}

      {hasEnoughPlayers(state) && (
        <div className="control-bar">
          <button
            className="control control-large"
            onClick={onStart}
            tabIndex={-1}
          >
            START
          </button>
        </div>
      )}
      <ul className="small-print">
        {hasEnoughPlayers(state) && <li>Enter: start game.</li>}
      </ul>
    </React.Fragment>
  );
}

type GameProps = (Turn | TurnResult) & {
  onGetOffTheTrain: () => void;
  onGoLeft: () => void;
  onGoRight: () => void;
  onGoFirst: () => void;
  onGoLast: () => void;
  onNextTurn: () => void;
};

function Game(state: GameProps) {
  const {
    onGetOffTheTrain,
    onGoFirst,
    onGoLast,
    onGoLeft,
    onGoRight,
    onNextTurn
  } = state;
  return (
    <React.Fragment>
      {stateIsTurn(state) ? (
        <Keyboard
          onEnter={onGetOffTheTrain}
          onLeft={onGoLeft}
          onRight={onGoRight}
          onShiftLeft={onGoFirst}
          onShiftRight={onGoLast}
        />
      ) : (
        <Keyboard onEnter={onNextTurn} />
      )}

      {state.players.map(({ name, station }, i) => (
        <div
          key={i}
          className={
            isCurrentPlayer(state, i) ? "player player-current" : "player"
          }
        >
          <p>
            {name} is at as station {station}
          </p>
          <div className="stations">
            {stations(state).map(someStation => (
              <code
                key={"station" + someStation}
                className={
                  station === someStation
                    ? "station station-current"
                    : "station"
                }
              >
                {someStation}
                :[
                {station === someStation ? "X" : " "}]
              </code>
            ))}
          </div>

          {stateIsTurn(state) &&
            isCurrentPlayer(state, i) && (
              <div className="control-bar">
                <button onClick={onGoFirst} className="control" tabIndex={-1}>
                  {"<<"}
                </button>
                <button onClick={onGoLeft} className="control" tabIndex={-1}>
                  {"<"}
                </button>
                <button onClick={onGoRight} className="control" tabIndex={-1}>
                  {">"}
                </button>
                <button onClick={onGoLast} className="control" tabIndex={-1}>
                  {">>"}
                </button>
                <button
                  onClick={onGetOffTheTrain}
                  className="control control-large"
                  tabIndex={-1}
                >
                  GET OFF THE TRAIN!
                </button>
              </div>
            )}
          {stateIsTurnResult(state) &&
            isCurrentPlayer(state, i) && (
              <React.Fragment>
                <p className="error">
                  {currentPlayer(state).station < state.secretStation
                    ? "You got off the grain too early!"
                    : "You got off the train too late!"}
                </p>
                <div className="control-bar">
                  <button
                    className="control control-large"
                    onClick={onNextTurn}
                  >
                    NEXT PLAYER
                  </button>
                </div>
              </React.Fragment>
            )}
        </div>
      ))}
      <ul className="small-print">
        {stateIsTurn(state) ? (
          <React.Fragment>
            <li>LeftArrow: go to previous station.</li>
            <li>RightArrow: go to getOffTheTrain station.</li>
            <li>Shift+LeftArrow: go to goFirst station.</li>
            <li>Shift+RightArrow: go to goLast station.</li>
            <li>Enter: get off the train.</li>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <li>Enter: Next player.</li>
          </React.Fragment>
        )}
      </ul>
    </React.Fragment>
  );
}

type GameOverPromptProps = GameOver & {
  onPlayAgain: () => void;
  onBeginAgain: () => void;
};

function GameOverPrompt(state: GameOverPromptProps) {
  const { onPlayAgain, onBeginAgain } = state;
  return (
    <React.Fragment>
      <Keyboard onEnter={onPlayAgain} onShiftEnter={onBeginAgain} />
      <h2>Game Over!</h2>
      <p>{state.winner.name} won the game.</p>
      <p>The secret station was station {state.winner.station}.</p>
      <div className="control-bar">
        <button
          className="control control-large"
          onClick={onPlayAgain}
          tabIndex={-1}
        >
          PLAY AGAIN
        </button>
        <button
          className="control control-large"
          onClick={onBeginAgain}
          tabIndex={-1}
        >
          NEW GAME
        </button>
      </div>
      <ul className="small-print">
        <li>Enter: play playAgain.</li>
        <li>Shift+Enter: play a new game.</li>
      </ul>
    </React.Fragment>
  );
}

const store = createStore<State, Action, any, any>(
  reducer,
  begin({
    firstStation: 1,
    lastStation: 7,
    makeSecretStation,
    maxPlayers: 4,
    minPlayers: 2,
    registeredPlayers: {}
  })
);

// Action Creators

const acknowledge = (action: Action): KnownAction => ({
  ...action,
  kind: "KnownAction"
});

const sendSetupNewGame = () => acknowledge({ type: "SetupNewGame" });
const sendStart = () => acknowledge({ type: "Start" });
const sendGetOffTheTrain = () => acknowledge({ type: "GetOffTheTrain" });
const sendGoLeft = () => acknowledge({ type: "GoLeft" });
const sendGoRight = () => acknowledge({ type: "GoRight" });
const sendGoFirst = () => acknowledge({ type: "GoFirst" });
const sendGoLast = () => acknowledge({ type: "GoLast" });
const sendNextTurn = () => acknowledge({ type: "NextTurn" });
const sendPlayAgain = () => acknowledge({ type: "PlayAgain" });
const sendBeginAgain = () => acknowledge({ type: "BeginAgain" });
const sendRegisterPlayer = (player: PlayerRegistration) =>
  acknowledge({
    payload: player,
    type: "RegisterPlayer"
  });

// Connected components

const CHeader = connect((state: State) => state)(Header);

const CPrompt = connect(
  (state: Begin) => state,
  { onSetupNewGame: sendSetupNewGame }
)(Prompt);

const CGameSetup = connect(
  (state: Setup) => state,
  {
    onRegisterPlayer: sendRegisterPlayer,
    onStart: sendStart
  }
)(GameSetup);

const CGame = connect(
  (state: Turn | TurnResult) => state,
  {
    onGetOffTheTrain: sendGetOffTheTrain,
    onGoFirst: sendGoFirst,
    onGoLast: sendGoLast,
    onGoLeft: sendGoLeft,
    onGoRight: sendGoRight,
    onNextTurn: sendNextTurn
  }
)(Game);

const CGameOverPrompt = connect(
  (state: GameOver) => state,
  {
    onBeginAgain: sendBeginAgain,
    onPlayAgain: sendPlayAgain
  }
)(GameOverPrompt);

const StationRace = (state: State) => (
  <React.Fragment>
    <CHeader />
    {stateIsBegin(state) && <CPrompt />}
    {stateIsSetup(state) && <CGameSetup />}
    {stateIsAnyTurn(state) && <CGame />}
    {stateIsGameOver(state) && <CGameOverPrompt />}
    <pre>{JSON.stringify(state, null, 2)}</pre>
  </React.Fragment>
);

const CStationRace = connect((state: State) => state)(StationRace);

ReactDOM.render(
  <Provider store={store}>
    <CStationRace />
  </Provider>,
  document.getElementById("root") as HTMLElement
);
