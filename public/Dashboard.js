const addPersonBtn = document.getElementById("addPersonBtn");
const addNewPerson = document.querySelector(".add-new");
const cancelPersonBtn = document.querySelector(".cancelbtn");
const submitPersonBtn = document.querySelector(".submit-person-btn");

addPersonBtn?.addEventListener("click", () => {
  addNewPerson.style.display = "block";
});

cancelPersonBtn?.addEventListener("click", () => {
  addNewPerson.style.display = "none";
});

submitPersonBtn?.addEventListener("click", () => {
  addNewPerson.style.display = "none";
});
