/*==================================================
  NCN INTERACTIONS
==================================================*/

const Interactions = (() => {

    let expandedStory = null;

    function init() {

        document.addEventListener("click", handleClick);

        window.addEventListener("scroll", updateParallax);

        window.addEventListener("resize", updateParallax);

        updateParallax();

    }

    /*==============================================
      CLICK
    ==============================================*/

    function handleClick(event){

        const story = event.target.closest(".story");

        if(!story) return;

        if(story === expandedStory){

            collapseStory();

            return;

        }

        expandStory(story);

    }

    /*==============================================
      EXPAND
    ==============================================*/

    function expandStory(story){

        collapseStory(false);

        expandedStory = story;

        story.classList.add("is-expanded");

        let passedExpanded = false;

        document.querySelectorAll(".story").forEach(item=>{

            if(item === story){

                passedExpanded = true;

                return;

            }

            if(passedExpanded){

                item.classList.add("is-hidden");

                setTimeout(()=>{

                    item.classList.remove("is-hidden");

                },450);

            }

        });

        story.scrollIntoView({

            behavior:"smooth",

            block:"center"

        });

    }

    /*==============================================
      COLLAPSE
    ==============================================*/

    function collapseStory(clearSelection=true){

        if(!expandedStory) return;

        expandedStory.classList.remove("is-expanded");

        if(clearSelection){

            expandedStory = null;

        }

    }

    /*==============================================
      PARALLAX
    ==============================================*/

    function updateParallax(){

        document.querySelectorAll(".story").forEach(story=>{

            const rect = story.getBoundingClientRect();

            const centre =
                rect.top +
                rect.height * .5;

            const offset =
                (centre - window.innerHeight/2)
                / window.innerHeight;

            story.querySelectorAll(".glyph").forEach(glyph=>{

                const z = Number(

                    getComputedStyle(glyph)
                    .getPropertyValue("--glyph-z")
                    .replace("px","")

                ) || 0;

                const movement =

                    offset *

                    (z/12);

                glyph.style.transform =

                    `translateY(${movement}px)
                     translateZ(${z}px)`;

            });

        });

    }

    return{

        init

    };

})();
