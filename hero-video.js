const video = document.querySelector("#hero-video");
const stop = document.querySelector("#hero-video-stop");

if (video && stop) {
  stop.addEventListener("click", () => {
    video.pause();
    video.currentTime = 0;
    video.load();
  });
}
