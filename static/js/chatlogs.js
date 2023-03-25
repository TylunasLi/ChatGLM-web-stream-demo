var $chatlogControl = {
    props: {
        dialogue : {
            type: Array,
            required: true,
            default: function() {
                var now = new Date();
                var _time = now.getFullYear() + "-" + (now.getMonth()+1) + "-" + now.getDate() + " "
                        + now.getHours() + ":00:00";
                return [{
                        "usertype" : 0,
                        "time" : _time,
                        "text" : "欢迎使用自然语言查询系统，您可以用自然语言查询表格的信息。"
                    }];
            }
        },
        users : {
            type: Array,
            required: false,
            default: function() {
                return ["机器人", "用户"]
            }
        }
    },
    template: '<div chat-log>\
              <div class="row utterance" v-for="utterance in dialogue">\
                <div class="col-xs-12 text-center time">--- {{ utterance.time }} ---</div>\
                <div class="avatar col-sm-1 text-center" v-bind:class="{ \'pull-right\' : utterance.usertype == 1 }">\
                  <div class="img-circle" v-bind:class="{ \'bg-primary\' : utterance.usertype == 1, \'bg-success-primary\' : utterance.usertype == 0 }">\
                    <p>\
                       <span>{{ users[utterance.usertype] }}</span>\
                    </p>\
                  </div>\
                </div>\
                <div class="col-xs-7" v-bind:class="{ \'pull-right\' : utterance.usertype == 1 }">\
                  <div class="alert" v-bind:class="{ \'alert-info\' : utterance.usertype == 1, \'alert-success\' : utterance.usertype == 0 }">\
                    <p class="markdown-body" v-html="utterance.text"></p>\
                  </div>\
                </div>\
              </div>\
          </div>',
    data : function() {
        return {
           "utterance" : {
               "usertype" : 0,
               "time" : "2021-04-01 10:30:10",
               "text" : "欢迎使用自然语言查询系统，您可以用自然语言查询表格的信息。"
           },
           "bot" : "机器人",
           "person" : "用户",
           "rightAlign" : "pull-right"
        }
    },
    // 计算属性
    updated : function (val) {
      document.querySelector(".utterance:last-child").scrollIntoView(false);
    },
    watch : {
       dialogue : function () {
         document.querySelector(".utterance:last-child").scrollIntoView(false);
       },
    }
};

Vue.component('chat-logs', window.$chatlogControl);
