<script>
  export let active = 0;
</script>

<!-- <div bp="grid">
  <img
    bp="offset-5@md 4@md 12@sm"
    src="images/handwash.gif"
    alt="how to wash your hands"
  />
</div> -->

<div bp="grid" class="c">
  <img class:next={active==1} bp="offset-5@md 1@md 3@sm" src="images/1.jpeg"
  alt="Wet hands with water" /> <img class:next={active==2} bp=" 1@md 3@sm"
  src="images/2.jpeg" alt="Apply enough soap to cover all hand surfaces" /> <img
  class:next={active==3} bp=" 1@md 3@sm" src="images/3.jpeg" alt="Rub hands palm
  to palm" /> <img class:next={active==4} bp=" 1@md 3@sm" src="images/4.jpeg"
  alt="Right palm over left dorsum with interlaced fingers and vice versa" />
</div>
<div bp="grid" class="c">
  <img class:next={active==5} bp="offset-5@md 1@md 3@sm" src="images/5.jpeg"
  alt="palm to palm with fingers interlaced" /> <img class:next={active==6} bp="
  1@md 3@sm" src="images/6.jpeg" alt="backs of fingers to opposing palms with
  fingers interlocked" /> <img class:next={active==7} bp=" 1@md 3@sm"
  src="images/7.jpeg" alt="rotational rubbing of left thumb clasped in right
  palm and vice versa" /> <img class:next={active==8} bp=" 1@md 3@sm"
  src="images/8.jpeg" alt="rotational rubbing, backwards and forwards with
  clasped fingers of right hand in left palm and vice versa" />
</div>
<div bp="grid" class="c">
  <img class:next={active==9} bp="offset-5@md 1@md 3@sm" src="images/9.jpeg"
  alt="Rinse hands with water" /> <img class:next={active==10} bp=" 1@md 3@sm"
  src="images/10.jpeg" alt="dry thoroughly with a single use towel" /> <img
  class:next={active==11} bp=" 1@md 3@sm" src="images/11.jpeg" alt="use towel to
  turn of faucet" /> <img class:next={active==12} bp=" 1@md 3@sm"
  src="images/12.jpeg" alt="...and your hans are safe" />
</div>

<style>
  img {
    width: 100%;
  }
  .c {
    margin: 10px 0;
  }

  .next {
    box-shadow: 2px 2px 3px 4px #ccc;
  }
</style>
