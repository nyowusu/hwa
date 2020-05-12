<script>
  import HowTo from "./components/HowTo.svelte";
  import Timer from "./components/Timer.svelte";

  let audio;
  let stages = [];
  let active = 0;

  function timerEnds() {
    audio.play();
    active = 0;
  }

  function showNextStage(e) {
    stages.push(e.detail.length);
    active = stages.length;
  }
</script>

<h1>Handwashing App</h1>

<Timer on:finished="{timerEnds}" on:nextStage="{showNextStage}"></Timer>
<HowTo {active}></HowTo>

<h3>
  <a href="https://www.who.int/gpsc/clean_hands_protection/en/"
    >Picture source</a
  >
  <a href="https://freesound.org/people/metrostock99/sounds/345086/"
    >Sound source</a
  >
</h3>

<audio bind:this="{audio}">
  <source src="build/sound.wav" />
</audio>

<style>
  h1,
  h3 {
    text-align: center;
  }

  a {
    display: inline-block;
    margin: 0 20px;
  }
</style>
