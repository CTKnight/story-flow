import {data} from "../../src/js/story-flow";
import axios from "axios";

axios.get("../test/Data/matrix.xml").then((d) => {
            data(d.data);
        });
axios.get("../test/Data/LetBulletFly.xml").then((d) => {
    data(d.data);
});