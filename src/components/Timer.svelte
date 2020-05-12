<script>
  import { createEventDispatcher } from "svelte";
  import ProgressBar from "./ProgressBar.svelte";

  // create event dispatch
  const dispatchFinishedEvent = createEventDispatcher();
  const dispatchNextStageEvent = createEventDispatcher();

  const totalSeconds = 20;
  const totalStages = 12;
  const stageLength =
    (totalSeconds / totalStages - totalSeconds / totalStages / 1000) * 1000;

  let secondLeft = totalSeconds;
  let isRunning = false;
  let stageLengthCompleted = 0;

  $: progress = (totalSeconds - secondLeft) * 5;

  function startTimer() {
    function countDown() {
      secondLeft -= 1;

      if (secondLeft == 0) {
        clearInterval(interval);
        isRunning = false;
        secondLeft = totalSeconds;
        dispatchFinishedEvent("finished", {
          text: "Timer Completed",
          length: 0,
        });
      }
    }

    function updateStage() {
      dispatchNextStageEvent("nextStage", { length: stageLength });

      stageLengthCompleted += stageLength;

      if (Math.ceil(stageLengthCompleted / 1000) == 20) {
        clearInterval(updateStages);
        stageLengthCompleted = 0;
      }
    }

    isRunning = true;
    const interval = setInterval(countDown, 1000);
    const updateStages = setInterval(updateStage, stageLength);
  }
</script>

<div bp="grid">
  <h2 bp="offset-5@md 4@md 12@sm">Seconds Left: {secondLeft}</h2>
</div>

<ProgressBar {progress}></ProgressBar>

<div bp="grid">
  <button
    bp="offset-5@md 4@md 12@sm"
    class="start"
    on:click="{startTimer}"
    disabled="{isRunning}"
  >
    Start
  </button>
</div>

<style>
  h2 {
    margin: 0;
  }

  .start {
    background-color: rgb(154, 73, 73);
    width: 100%;
    margin: 10px 0;
    box-shadow: 2px 2px 3px 4px #ccc;
  }

  .start:disabled {
    background-color: grey;
    box-shadow: none;
    cursor: not-allowed;
    transform: translateY(3px);
  }

  .start:active {
    box-shadow: none;
    transform: translateY(3px);
  }
</style>
