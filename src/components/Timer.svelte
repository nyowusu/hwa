<script>
  import ProgressBar from "./ProgressBar.svelte";

  const totalSeconds = 20;
  let secondLeft = totalSeconds;
  let isRunning = false;
  $: progress = (totalSeconds - secondLeft) * 5;

  function startTimer() {
    function countDown() {
      secondLeft -= 1;
      if (secondLeft == 0) {
        clearInterval(interval);
        isRunning = false;
        secondLeft = totalSeconds;
      }
    }
    isRunning = true;
    const interval = setInterval(countDown, 1000);
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
    box-shadow: 3px 3px 5px 2px #ccc;
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
