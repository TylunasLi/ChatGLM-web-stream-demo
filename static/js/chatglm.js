var baseUrl = "http://localhost:8800/"

var rendererMD = new marked.Renderer();

marked.setOptions({
  renderer: rendererMD,
  gfm: true,
  tables: true,
  breaks: false,
  pedantic: false,
  sanitize: false,
  smartLists: true,
  smartypants: false,
  highlight: function (code) {
    return hljs.highlightAuto(code).value;
  }
})

function time_string() {
  var now = new Date();
  return now.getFullYear() + "-" + (now.getMonth()+1) + "-" + now.getDate() + " "
      + now.getHours() + ":"+ now.getMinutes() + ":" + now.getSeconds();
}

function query_chatglm_by_stream(args, vue, last) {
    var stream = ""
    const { EventSource } = createEventSource();
    var evtSource = new EventSource(baseUrl + "stream", {
      method: "POST",
      body: JSON.stringify(args),
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json"
      }
    });
    evtSource.addEventListener("delta", (event) => {
      try {
        let response = JSON.parse(event.data);
        if (response.finished) {
          vue.history.push([
             response.query, response.response
          ]);
          evtSource.close();
          last.text = marked(response.response)
        } else {
          if (!last.text)
            last.time = time_string()
          stream += response.delta
          last.text = marked(stream)
        }
      } catch (error) {
        console.error("failed to parse response. ", event.data);
      }
    });
    evtSource.onerror = function (event) {
        last.text = "对不起，ChatGLM暂时无法回答您的问题"
        console.error("failed to receive response");
    };
}

async function query_chatglm(args, vue) {
  const resp = await fetch(baseUrl + "chat", {
    method: "POST",
    body: JSON.stringify(args),
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/json"
    }
  });
  try {
    response = await resp.json();
    vue.chatlogs.push({
      "usertype" : 0, "time" : time_string(), "text" : marked(response.response)
    });
    vue.history.push([
       response.query, response.response
    ]);
  } catch (error) {
    vue.chatlogs.push({
      "usertype" : 0, "time" : time_string(), "text" : "对不起，ChatGLM暂时无法回答您的问题"
    });
  }
}

var app = new Vue({
  el: '#app',
  data : function () {
    let _time = time_string();
    return {
      itemPerPage : 10,
      total: 200,
      users : ["Chat GLM", "用户"],
      chatlogs : [{
        "usertype" : 0,
        "time" : _time,
        "text" : "欢迎使用ChatGLM，您可以用自然语言命令我完成任务。"
      }],
      history : [],
      question : ""
    }
  },
  methods: {
    clear : function () {
      this.history = []
    },
    answerQuestion : function (query) {
      if ("" == query) return;
      this.question = "";
      let _time = time_string();
      this.chatlogs.push({
          "usertype" : 1, "time" : _time, "text" : marked(query)
        });
      let args = {
        "query" : query,  "history" : this.history
      };
      if ('EventSource' in window) {
        let last = { "usertype" : 0, "time" : _time, "text" : "" };
        this.chatlogs.push(last);
        query_chatglm_by_stream(args, this, last);
      } else {
        query_chatglm(args, this);
      }
    }
  },
  computed: {
  }
})
